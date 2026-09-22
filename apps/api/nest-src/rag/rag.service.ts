import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PDFParse } from 'pdf-parse'
import { decrypt } from '@orh/crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { AiService } from '../ai/ai.service'
import { getProviderMeta, type AiProviderId } from '../ai/ai.providers'
import {
  RAG_STRATEGY_META,
  type IngestJsonDto,
  type QueryDto,
  type RagQueryResult,
  type RagSource,
  type RagStep,
  type RagStrategy,
} from './dto'

const EMBED_BATCH = 50
const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
const MAX_CHUNKS = 300
const RRF_K = 60
const FETCH_TIMEOUT_MS = 20_000

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Trích JSON object/array đầu tiên trong text LLM (best-effort). */
function extractJson(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

interface ExtractedPart {
  content: string
  modality: 'text' | 'table' | 'image'
}

export interface RetrievedChunk {
  id: string
  documentId: string
  documentTitle: string
  content: string
  modality: 'text' | 'table' | 'image'
  score: number
}

/**
 * RagService — Kho tri thức + 5 kiến trúc RAG.
 *
 * BẢO MẬT:
 * - Embedding/chat dùng key AI Pro của user, giải mã server-side qua AiService.
 * - KHÔNG log nội dung tài liệu, câu hỏi hay key vào audit — chỉ metadata.
 * - Mọi lỗi provider đều sanitize trước khi trả về client.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly aiService: AiService,
  ) {}

  /** Metadata 5 kiến trúc cho frontend (public). */
  getStrategies() {
    return RAG_STRATEGY_META
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async listDocuments(workspaceId: string) {
    const docs = await this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      sourceType: d.sourceType,
      sourceUrl: d.sourceUrl,
      mimeType: d.mimeType,
      status: d.status,
      chunkCount: d.chunkCount,
      error: d.error,
      createdAt: d.createdAt,
    }))
  }

  /**
   * POST /rag/documents — nạp tài liệu từ file upload, text thuần hoặc URL.
   * Đúng 1 trong 3 nguồn. Xử lý đồng bộ: chunk → embed → lưu vector.
   */
  async ingest(
    workspaceId: string,
    file: Express.Multer.File | undefined,
    body: IngestJsonDto | undefined,
    ip?: string,
  ) {
    const text = body?.text?.trim()
    const url = body?.url?.trim()
    const titleInput = body?.title?.trim()
    const provided = [!!file, !!text, !!url].filter(Boolean).length
    if (provided !== 1) {
      throw new BadRequestException('Hãy chọn đúng 1 nguồn: upload file, hoặc văn bản, hoặc URL.')
    }

    let title = titleInput || ''
    let sourceType: 'file' | 'url' | 'text'
    let sourceUrl: string | undefined
    let mimeType: string | undefined
    let parts: ExtractedPart[]

    if (file) {
      sourceType = 'file'
      mimeType = file.mimetype
      title = title || file.originalname
      parts = await this.extractFromFile(workspaceId, file)
    } else if (url) {
      sourceType = 'url'
      sourceUrl = url
      const page = await this.extractFromUrl(url)
      title = title || page.title || url
      parts = [{ content: page.text, modality: 'text' }]
    } else {
      sourceType = 'text'
      title = title || (text as string).slice(0, 60)
      parts = [{ content: text as string, modality: 'text' }]
    }

    const doc = await this.prisma.document.create({
      data: {
        workspaceId,
        title: title.slice(0, 200),
        sourceType,
        sourceUrl,
        mimeType,
        status: 'processing',
      },
    })

    try {
      // Chunking
      let all: ExtractedPart[] = []
      for (const part of parts) {
        const pieces = part.modality === 'table' ? [part.content] : chunkText(part.content)
        for (const c of pieces) all.push({ content: c, modality: part.modality })
      }
      if (all.length === 0) throw new BadRequestException('Không trích xuất được nội dung nào từ nguồn này.')
      if (all.length > MAX_CHUNKS) all = all.slice(0, MAX_CHUNKS)

      // Lưu chunks (raw SQL — Prisma không map được cột vector)
      const ids = await this.insertChunksRaw(doc.id, workspaceId, all)

      // Embed theo batch
      for (let i = 0; i < all.length; i += EMBED_BATCH) {
        const batch = all.slice(i, i + EMBED_BATCH)
        const vectors = await this.aiService.embed(
          workspaceId,
          batch.map((b) => b.content),
          ip,
        )
        await Promise.all(
          batch.map((_, j) => this.updateEmbedding(ids[i + j], vectors[j])),
        )
      }

      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'ready', chunkCount: all.length },
      })

      // GraphRAG: trích entity/relation best-effort, không block response
      this.buildGraph(workspaceId, doc.id, all.slice(0, 8)).catch(() => {})

      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'rag_ingest',
        entityType: 'document',
        targetId: doc.id,
        result: 'success',
        metadata: { sourceType, chunks: all.length, title: title.slice(0, 80) },
        ip,
      })

      return { id: doc.id, title: doc.title, status: 'ready', chunkCount: all.length }
    } catch (err) {
      // Lỗi không phải HttpException: hiện tên loại lỗi để dễ chẩn đoán
      // (chỉ tên class, không chứa nội dung nhạy cảm)
      const errName =
        err instanceof HttpException ? '' : ` [${(err as Error)?.constructor?.name ?? 'UnknownError'}]`
      const message =
        err instanceof HttpException ? err.message : `Xử lý tài liệu thất bại. Hãy thử lại.${errName}`
      // Log đầy đủ phía server để xem trong Render logs
      if (!(err instanceof HttpException)) console.error('[rag_ingest] unexpected error:', err)
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'failed', error: String(message).slice(0, 500) },
      })
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'rag_ingest',
        entityType: 'document',
        targetId: doc.id,
        result: 'failure',
        metadata: { sourceType },
        ip,
      })
      throw err instanceof HttpException ? err : new BadRequestException(message)
    }
  }

  async deleteDocument(workspaceId: string, id: string, ip?: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, workspaceId } })
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu.')

    // Xóa entity/relation/community liên quan (relation/community không có FK)
    const entities = await this.prisma.entity.findMany({
      where: { documentId: id },
      select: { id: true },
    })
    const entityIds = entities.map((e) => e.id)
    if (entityIds.length > 0) {
      await this.prisma.relation.deleteMany({
        where: { workspaceId, OR: [{ fromId: { in: entityIds } }, { toId: { in: entityIds } }] },
      })
      const comms = await this.prisma.community.findMany({
        where: { workspaceId, entityIds: { hasSome: entityIds } },
      })
      for (const c of comms) {
        const remaining = c.entityIds.filter((eid) => !entityIds.includes(eid))
        if (remaining.length === 0) {
          await this.prisma.community.delete({ where: { id: c.id } })
        } else {
          await this.prisma.community.update({
            where: { id: c.id },
            data: { entityIds: remaining },
          })
        }
      }
    }

    // chunks + entities còn lại cascade theo FK
    await this.prisma.document.delete({ where: { id } })

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'rag_delete_document',
      entityType: 'document',
      targetId: id,
      result: 'success',
      metadata: { title: doc.title.slice(0, 80) },
      ip,
    })
    return { ok: true }
  }

  // ─── Query: 5 kiến trúc ───────────────────────────────────────────────────

  /** POST /rag/query */
  async query(workspaceId: string, dto: QueryDto, ip?: string): Promise<RagQueryResult> {
    const topK = dto.topK ?? 6
    const provider = await this.resolveProvider(workspaceId, dto.provider)
    const model = dto.model?.trim()

    let result: RagQueryResult
    switch (dto.strategy) {
      case 'hybrid':
        result = await this.strategyHybrid(workspaceId, provider, model, dto.query, topK)
        break
      case 'graph':
        result = await this.strategyGraph(workspaceId, provider, model, dto.query, topK)
        break
      case 'agentic':
        result = await this.strategyAgentic(workspaceId, provider, model, dto.query, topK)
        break
      case 'corrective':
        result = await this.strategyCorrective(workspaceId, provider, model, dto.query, topK)
        break
      case 'multimodal':
        result = await this.strategyMultimodal(workspaceId, provider, model, dto.query, topK)
        break
      default:
        throw new BadRequestException('Strategy không được hỗ trợ.')
    }

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'rag_query',
      provider,
      entityType: 'document',
      result: 'success',
      // Chỉ metadata — không log nội dung câu hỏi/câu trả lời
      metadata: {
        strategy: dto.strategy,
        topK,
        sources: result.sources.length,
        queryLength: dto.query.length,
        outsideKnowledge: result.outsideKnowledge ?? false,
      },
      ip,
    })

    return result
  }

  /**
   * Retrieval-only cho agent tool `knowledge_search`: hybrid dense+sparse (RRF),
   * KHÔNG gọi LLM. Trả về tối đa `topK` chunk (mặc định 5, trần 10).
   */
  async searchChunks(
    workspaceId: string,
    query: string,
    topK = 5,
  ): Promise<Array<{ title: string; content: string; score: number }>> {
    const k = Math.min(Math.max(topK, 1), 10)
    const chunks = await this.hybridRetrieve(workspaceId, query, k)
    return chunks.map((c) => ({ title: c.documentTitle, content: c.content, score: c.score }))
  }

  // ── Strategy 1: Hybrid RAG (dense + sparse + RRF) ─────────────────────────

  private async strategyHybrid(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    topK: number,
  ): Promise<RagQueryResult> {
    const retrieved = await this.hybridRetrieve(workspaceId, query, topK)
    if (retrieved.length === 0) {
      return {
        answer:
          'Kho tri thức chưa có tài liệu nào phù hợp với câu hỏi. Hãy thêm tài liệu ở trang Kho tri thức rồi hỏi lại.',
        strategy: 'hybrid',
        sources: [],
      }
    }
    const context = retrieved
      .map((c, i) => `[${i + 1}] ${c.documentTitle}\n${c.content}`)
      .join('\n\n')
    const answer = await this.answerWithContext(
      workspaceId,
      provider,
      model,
      'Bạn là trợ lý AI trả lời dựa trên TÀI LIỆU được cung cấp. Quy tắc: chỉ dùng thông tin trong tài liệu; trích dẫn nguồn bằng số thứ tự [1], [2]; nếu tài liệu không đủ để trả lời, hãy nói rõ thay vì bịa đặt. Trả lời bằng tiếng Việt, súc tích.',
      `TÀI LIỆU:\n${context}`,
      query,
    )
    return { answer, strategy: 'hybrid', sources: toSources(retrieved) }
  }

  // ── Strategy 5: Multimodal RAG (unified index + tag modality) ─────────────

  private async strategyMultimodal(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    topK: number,
  ): Promise<RagQueryResult> {
    const retrieved = await this.hybridRetrieve(workspaceId, query, topK)
    if (retrieved.length === 0) {
      return {
        answer:
          'Kho tri thức chưa có tài liệu nào phù hợp với câu hỏi. Hãy thêm tài liệu (text, bảng, ảnh) ở trang Kho tri thức rồi hỏi lại.',
        strategy: 'multimodal',
        sources: [],
      }
    }
    const tag = (c: RetrievedChunk) =>
      c.modality === 'table' ? '[TABLE]' : c.modality === 'image' ? '[IMAGE: mô tả ảnh]' : '[TEXT]'
    const context = retrieved
      .map((c, i) => `[${i + 1}] ${tag(c)} ${c.documentTitle}\n${c.content}`)
      .join('\n\n')
    const answer = await this.answerWithContext(
      workspaceId,
      provider,
      model,
      'Bạn là trợ lý AI đa phương thức. TÀI LIỆU gồm text, bảng ([TABLE] — giữ nguyên cấu trúc khi trích dẫn số liệu) và mô tả ảnh ([IMAGE]). Chỉ dùng thông tin trong tài liệu, trích dẫn nguồn [1], [2]. Trả lời bằng tiếng Việt, súc tích.',
      `TÀI LIỆU:\n${context}`,
      query,
    )
    return { answer, strategy: 'multimodal', sources: toSources(retrieved) }
  }

  // ── Strategy 2: GraphRAG ─────────────────────────────────────────────────

  private async strategyGraph(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    topK: number,
  ): Promise<RagQueryResult> {
    // 1. LLM trích thực thể từ câu hỏi
    const extRes = await this.aiService.chat(workspaceId, {
      provider,
      messages: [
        {
          role: 'system',
          content:
            'Trích các thực thể (người, tổ chức, khái niệm, sản phẩm, địa điểm) trong câu hỏi. Trả về DUY NHẤT JSON: {"entities":["..."]}.',
        },
        { role: 'user', content: query },
      ],
      model,
      maxTokens: 300,
    })
    const parsed = extractJson(extRes.content)
    const names: string[] = Array.isArray(parsed?.entities)
      ? parsed.entities.map((n: unknown) => String(n)).filter((n: string) => n.length > 1).slice(0, 8)
      : []

    // 2. Match entity trong đồ thị
    const matched =
      names.length > 0
        ? await this.prisma.entity.findMany({
            where: {
              workspaceId,
              OR: names.map((n) => ({ name: { contains: n, mode: 'insensitive' as const } })),
            },
            take: 30,
          })
        : []

    if (matched.length === 0) {
      // Không có thực thể khớp → fallback sang hybrid nhưng giữ nhãn graph
      const fb = await this.strategyHybrid(workspaceId, provider, model, query, topK)
      return { ...fb, strategy: 'graph' }
    }

    // 3. Duyệt quan hệ 2 hops
    const seen = new Set(matched.map((e) => e.id))
    const rels: Array<{ fromId: string; toId: string; relation: string; description: string | null }> = []
    let frontier = [...seen]
    for (let hop = 0; hop < 2 && frontier.length > 0; hop++) {
      const batch = await this.prisma.relation.findMany({
        where: {
          workspaceId,
          OR: [{ fromId: { in: frontier } }, { toId: { in: frontier } }],
        },
        take: 100,
      })
      rels.push(...batch)
      const next: string[] = []
      for (const r of batch) {
        if (!seen.has(r.fromId)) { seen.add(r.fromId); next.push(r.fromId) }
        if (!seen.has(r.toId)) { seen.add(r.toId); next.push(r.toId) }
      }
      frontier = next
    }

    const allEntities = await this.prisma.entity.findMany({
      where: { id: { in: [...seen] } },
    })
    const byId = new Map(allEntities.map((e) => [e.id, e]))

    // 4. Community summaries liên quan
    const communities = await this.prisma.community.findMany({
      where: { workspaceId, entityIds: { hasSome: [...seen] } },
      take: 5,
    })

    // 5. Build context
    const entLines = allEntities.map(
      (e) => `- ${e.name} (${e.type})${e.summary ? `: ${e.summary}` : ''}`,
    )
    const relLines = rels
      .slice(0, 40)
      .map((r) => {
        const from = byId.get(r.fromId)?.name ?? r.fromId
        const to = byId.get(r.toId)?.name ?? r.toId
        return `- ${from} --[${r.relation}]--> ${to}${r.description ? ` (${r.description})` : ''}`
      })
    const commLines = communities.map((c) => `- ${c.title}: ${c.summary}`)
    const context = [
      'THỰC THỂ:',
      ...entLines,
      '',
      'QUAN HỆ:',
      ...relLines,
      ...(commLines.length ? ['', 'TÓM TẮT CỘNG ĐỒNG:', ...commLines] : []),
    ].join('\n')

    const answer = await this.answerWithContext(
      workspaceId,
      provider,
      model,
      'Bạn là trợ lý AI trả lời dựa trên ĐỒ THỊ TRI THỨC (thực thể + quan hệ). Quy tắc: chỉ dùng thông tin trong đồ thị; nêu rõ mối quan hệ giữa các thực thể khi trả lời; nếu đồ thị không đủ, hãy nói rõ. Trả lời bằng tiếng Việt, súc tích.',
      `ĐỒ THỊ TRI THỨC:\n${context}`,
      query,
    )

    // Sources: chunks liên quan tới các entity (qua documentId)
    const docIds = [...new Set(allEntities.map((e) => e.documentId).filter(Boolean))] as string[]
    const sources: RagSource[] = []
    if (docIds.length > 0) {
      const chunks = await this.prisma.chunk.findMany({
        where: { documentId: { in: docIds.slice(0, 5) } },
        take: topK,
        include: { document: { select: { title: true } } },
      })
      for (const c of chunks) {
        sources.push({
          documentId: c.documentId,
          documentTitle: c.document.title,
          chunkId: c.id,
          score: 1,
          modality: c.modality as RagSource['modality'],
        })
      }
    }

    return { answer, strategy: 'graph', sources }
  }

  // ── Strategy 3: Agentic RAG ───────────────────────────────────────────────

  private async strategyAgentic(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    topK: number,
  ): Promise<RagQueryResult> {
    const steps: RagStep[] = []
    const collected = new Map<string, RetrievedChunk>()

    const toolDesc = [
      '- vector_search {"query":"..."}: tìm đoạn văn theo ngữ nghĩa (embedding).',
      '- keyword_search {"query":"..."}: tìm đoạn văn theo từ khóa (full-text).',
      '- document_stats {}: xem kho tri thức có bao nhiêu tài liệu/đoạn.',
    ].join('\n')

    const ask = async (conversation: string): Promise<string> => {
      const res = await this.aiService.chat(workspaceId, {
        provider,
        messages: [
          {
            role: 'system',
            content: `Bạn là agent truy hồi thông tin. CÔNG CỤ:\n${toolDesc}\n\nNếu cần thêm thông tin, trả về DUY NHẤT một JSON: {"tool":"vector_search|keyword_search|document_stats","args":{...}}. Nếu đã đủ thông tin để trả lời câu hỏi gốc, trả về DUY NHẤT JSON: {"answer":"..."}. Không thêm text ngoài JSON. Tối đa 4 vòng.`,
          },
          { role: 'user', content: conversation },
        ],
        model,
        maxTokens: 1200,
      })
      return res.content
    }

    const runTool = async (tool: string, args: Record<string, unknown>): Promise<string> => {
      if (tool === 'document_stats') {
        const [docs, chunks] = await Promise.all([
          this.prisma.document.count({ where: { workspaceId, status: 'ready' } }),
          this.prisma.chunk.count({ where: { workspaceId } }),
        ])
        return `Kho tri thức: ${docs} tài liệu sẵn sàng, ${chunks} đoạn văn.`
      }
      const q = String(args.query ?? query)
      const found =
        tool === 'vector_search'
          ? await this.denseSearch(workspaceId, (await this.embedQuery(workspaceId, q)), 6)
          : await this.sparseSearch(workspaceId, q, 6)
      for (const c of found) collected.set(c.id, c)
      if (found.length === 0) return 'Không tìm thấy đoạn nào.'
      return found
        .map((c, i) => `[${i + 1}] ${c.documentTitle} (${c.modality}, score ${c.score.toFixed(3)}): ${c.content.slice(0, 500)}`)
        .join('\n')
    }

    let conversation = `CÂU HỎI GỐC: ${query}`
    let finalAnswer: string | null = null

    for (let round = 0; round < 4; round++) {
      const raw = await ask(conversation)
      const parsed = extractJson(raw)
      if (parsed && typeof parsed.answer === 'string' && parsed.answer.trim()) {
        finalAnswer = parsed.answer
        break
      }
      if (
        parsed &&
        typeof parsed.tool === 'string' &&
        ['vector_search', 'keyword_search', 'document_stats'].includes(parsed.tool)
      ) {
        const args = (parsed.args ?? {}) as Record<string, unknown>
        const resultText = await runTool(parsed.tool, args)
        steps.push({ tool: parsed.tool, args, result: resultText.slice(0, 800) })
        conversation += `\n\nKẾT QUẢ ${parsed.tool}:\n${resultText.slice(0, 3000)}`
        continue
      }
      // Không parse được JSON → coi toàn bộ là câu trả lời
      finalAnswer = raw
      break
    }

    if (!finalAnswer) {
      // Hết vòng mà agent chưa trả lời → tổng hợp từ những gì đã thu thập
      const chunks = [...collected.values()].slice(0, topK)
      if (chunks.length === 0) {
        finalAnswer = 'Agent đã thử nhiều vòng nhưng không tìm được thông tin phù hợp trong kho tri thức.'
      } else {
        const context = chunks.map((c, i) => `[${i + 1}] ${c.documentTitle}\n${c.content}`).join('\n\n')
        finalAnswer = await this.answerWithContext(
          workspaceId,
          provider,
          model,
          'Bạn tổng hợp câu trả lời từ các đoạn tài liệu agent đã thu thập. Trích dẫn nguồn [1], [2]. Tiếng Việt, súc tích.',
          `TÀI LIỆU AGENT THU THẬP:\n${context}`,
          query,
        )
      }
    }

    const sources = toSources([...collected.values()].slice(0, topK))
    return { answer: finalAnswer, strategy: 'agentic', sources, steps }
  }

  // ── Strategy 4: Corrective RAG ───────────────────────────────────────────

  private async strategyCorrective(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    topK: number,
  ): Promise<RagQueryResult> {
    let retrieved = await this.hybridRetrieve(workspaceId, query, topK)
    let relevant = await this.gradeRelevant(workspaceId, provider, model, query, retrieved)

    // Mơ hồ → viết lại câu hỏi 1 lần rồi retrieve lại
    if (relevant.length === 0 && retrieved.length > 0) {
      const rewritten = await this.rewriteQuery(workspaceId, provider, model, query)
      if (rewritten && rewritten !== query) {
        retrieved = await this.hybridRetrieve(workspaceId, rewritten, topK)
        relevant = await this.gradeRelevant(workspaceId, provider, model, rewritten, retrieved)
      }
    }

    // Vẫn không có gì → web fallback (đánh dấu ngoài tri thức)
    if (relevant.length === 0) {
      const web = await this.webSearch(query)
      const answer = await this.answerWithContext(
        workspaceId,
        provider,
        model,
        'Kho tri thức nội bộ KHÔNG có thông tin. Bạn trả lời dựa trên KẾT QUẢ TÌM KIẾM WEB bên dưới. Bắt đầu câu trả lời bằng câu: "Thông tin dưới đây từ web, ngoài kho tri thức của bạn:". Nếu web cũng không có, hãy nói rõ. Tiếng Việt, súc tích.',
        web ? `KẾT QUẢ TÌM KIẾM WEB:\n${web}` : 'Không tìm được kết quả web nào.',
        query,
      )
      return { answer, strategy: 'corrective', sources: [], outsideKnowledge: true }
    }

    const context = relevant
      .map((c, i) => `[${i + 1}] ${c.documentTitle}\n${c.content}`)
      .join('\n\n')
    const answer = await this.answerWithContext(
      workspaceId,
      provider,
      model,
      'Bạn trả lời dựa trên các đoạn tài liệu ĐÃ ĐƯỢC CHẤM ĐIỂM là liên quan. Chỉ dùng thông tin trong đó, trích dẫn [1], [2]. Tiếng Việt, súc tích.',
      `TÀI LIỆU (đã kiểm duyệt liên quan):\n${context}`,
      query,
    )
    return { answer, strategy: 'corrective', sources: toSources(relevant) }
  }

  /** LLM grader: chấm từng chunk relevant/ambiguous/irrelevant. */
  private async gradeRelevant(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    if (chunks.length === 0) return []
    try {
      const res = await this.aiService.chat(workspaceId, {
        provider,
        messages: [
          {
            role: 'system',
            content:
              'Bạn là grader kiểm duyệt truy hồi. Với mỗi đoạn văn, đánh giá mức độ liên quan đến CÂU HỎI: "relevant" (giúp trả lời trực tiếp hoặc một phần), "ambiguous" (cùng chủ đề nhưng chưa rõ có giúp được không), "irrelevant" (không liên quan). Trả về DUY NHẤT JSON mảng: [{"index":0,"verdict":"relevant"},...].',
          },
          {
            role: 'user',
            content: `CÂU HỎI: ${query}\n\nCÁC ĐOẠN:\n${chunks
              .map((c, i) => `[${i}] ${c.content.slice(0, 800)}`)
              .join('\n\n')}`,
          },
        ],
        model,
        maxTokens: 500,
      })
      const parsed = extractJson(res.content)
      const list: Array<{ index: number; verdict: string }> = Array.isArray(parsed) ? parsed : []
      const verdictOf = (i: number): string =>
        list.find((v) => v?.index === i)?.verdict ?? 'ambiguous'
      return chunks.filter((_, i) => verdictOf(i) === 'relevant')
    } catch {
      // Grader lỗi → fail-open: giữ lại tất cả để không block câu trả lời
      return chunks
    }
  }

  private async rewriteQuery(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    query: string,
  ): Promise<string> {
    try {
      const res = await this.aiService.chat(workspaceId, {
        provider,
        messages: [
          {
            role: 'system',
            content:
              'Viết lại câu hỏi của user thành một câu hỏi tìm kiếm rõ ràng, cụ thể hơn (thêm từ đồng nghĩa, bối cảnh). Chỉ trả về câu hỏi đã viết lại, không giải thích.',
          },
          { role: 'user', content: query },
        ],
        model,
        maxTokens: 200,
      })
      return res.content.trim().slice(0, 500)
    } catch {
      return query
    }
  }

  /** Web fallback qua DuckDuckGo (không cần key). Lỗi → chuỗi rỗng (graceful). */
  private async webSearch(query: string): Promise<string> {
    try {
      const res = await fetchTimeout(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenRemoteHub/1.0)' } },
        12000,
      )
      if (!res.ok) return ''
      const html = await res.text()
      const out: string[] = []
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) && out.length < 5) {
        const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (title) out.push(`- ${title} (${m[1]})`)
      }
      return out.join('\n')
    } catch {
      return ''
    }
  }

  // ─── Retrieval nền tảng ───────────────────────────────────────────────────

  private async embedQuery(workspaceId: string, query: string): Promise<number[]> {
    const vectors = await this.aiService.embed(workspaceId, [query])
    return vectors[0]
  }

  /** Dense retrieval: cosine similarity qua pgvector. */
  private async denseSearch(
    workspaceId: string,
    vector: number[],
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const literal = `[${vector.map((v) => v.toFixed(6)).join(',')}]`
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string
        documentId: string
        documentTitle: string
        content: string
        modality: string
        score: number
      }>
    >(
      `SELECT c."id", c."documentId", d."title" AS "documentTitle", c."content", c."modality",
              1 - (c."embedding" <=> $1::vector) AS "score"
       FROM "chunks" c
       JOIN "documents" d ON d."id" = c."documentId"
       WHERE c."workspaceId" = $2 AND c."embedding" IS NOT NULL AND d."status" = 'ready'
       ORDER BY c."embedding" <=> $1::vector
       LIMIT $3`,
      literal,
      workspaceId,
      limit,
    )
    return rows.map((r) => ({ ...r, modality: r.modality as RetrievedChunk['modality'] }))
  }

  /** Sparse retrieval: full-text search trên cột tsvector. */
  private async sparseSearch(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string
        documentId: string
        documentTitle: string
        content: string
        modality: string
        score: number
      }>
    >(
      `SELECT c."id", c."documentId", d."title" AS "documentTitle", c."content", c."modality",
              ts_rank(c."search", plainto_tsquery('simple', $1)) AS "score"
       FROM "chunks" c
       JOIN "documents" d ON d."id" = c."documentId"
       WHERE c."workspaceId" = $2 AND d."status" = 'ready'
         AND c."search" @@ plainto_tsquery('simple', $1)
       ORDER BY "score" DESC
       LIMIT $3`,
      query,
      workspaceId,
      limit,
    )
    return rows.map((r) => ({ ...r, modality: r.modality as RetrievedChunk['modality'] }))
  }

  /** Reciprocal Rank Fusion (k=60): hợp nhất dense + sparse. */
  private rrf(lists: RetrievedChunk[][], topK: number): RetrievedChunk[] {
    const fused = new Map<string, { chunk: RetrievedChunk; score: number }>()
    for (const list of lists) {
      list.forEach((chunk, rank) => {
        const prev = fused.get(chunk.id)
        const add = 1 / (RRF_K + rank + 1)
        fused.set(chunk.id, { chunk, score: (prev?.score ?? 0) + add })
      })
    }
    return [...fused.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((f) => ({ ...f.chunk, score: f.score }))
  }

  /** Hybrid retrieve: dense + sparse → RRF. */
  private async hybridRetrieve(
    workspaceId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const vector = await this.embedQuery(workspaceId, query)
    const [dense, sparse] = await Promise.all([
      this.denseSearch(workspaceId, vector, Math.max(topK * 2, 12)),
      this.sparseSearch(workspaceId, query, Math.max(topK * 2, 12)),
    ])
    return this.rrf([dense, sparse], topK)
  }

  /** Gọi LLM trả lời dựa trên context (dùng AiService.chat — key giải mã server-side). */
  private async answerWithContext(
    workspaceId: string,
    provider: AiProviderId,
    model: string | undefined,
    systemPrompt: string,
    contextBlock: string,
    query: string,
  ): Promise<string> {
    const res = await this.aiService.chat(workspaceId, {
      provider,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${contextBlock}\n\nCÂU HỎI: ${query}` },
      ],
      model,
      maxTokens: 1500,
    })
    return res.content
  }

  /** Chọn provider: dto.provider (nếu active) hoặc connection active đầu tiên. */
  private async resolveProvider(
    workspaceId: string,
    preferred?: AiProviderId,
  ): Promise<AiProviderId> {
    if (preferred) {
      const conn = await this.prisma.aiConnection.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: preferred } },
      })
      if (conn?.status === 'active') return preferred
      const meta = getProviderMeta(preferred)
      throw new BadRequestException(
        `Chưa kết nối ${meta?.name ?? preferred} hoặc key đã bị vô hiệu. Hãy kết nối lại ở Cài đặt → AI Pro.`,
      )
    }
    const first = await this.prisma.aiConnection.findFirst({
      where: { workspaceId, status: 'active' },
      orderBy: { provider: 'asc' },
    })
    if (!first) {
      throw new BadRequestException(
        'Chưa kết nối AI nào. Hãy vào Cài đặt → AI Pro để thêm API key trước khi dùng RAG.',
      )
    }
    return first.provider as AiProviderId
  }

  // ─── Ingest helpers ───────────────────────────────────────────────────────

  /** Lưu chunks bằng raw SQL (Prisma không map được cột vector). Trả về ids. */
  private async insertChunksRaw(
    documentId: string,
    workspaceId: string,
    chunks: ExtractedPart[],
  ): Promise<string[]> {
    const ids = chunks.map(() => randomUUID())
    const values: string[] = []
    const params: unknown[] = []
    chunks.forEach((c, i) => {
      const b = i * 7
      values.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, NOW())`,
      )
      params.push(
        ids[i],
        documentId,
        workspaceId,
        c.content,
        c.modality,
        Math.ceil(c.content.length / 4),
        null, // metadata
      )
    })
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "chunks" ("id", "documentId", "workspaceId", "content", "modality", "tokenCount", "metadata", "createdAt") VALUES ${values.join(',')}`,
      ...params,
    )
    return ids
  }

  private async updateEmbedding(id: string, vector: number[]): Promise<void> {
    const literal = `[${vector.map((v) => v.toFixed(6)).join(',')}]`
    await this.prisma.$executeRawUnsafe(
      'UPDATE "chunks" SET "embedding" = $1::vector WHERE "id" = $2',
      literal,
      id,
    )
  }

  private async extractFromFile(
    workspaceId: string,
    file: Express.Multer.File,
  ): Promise<ExtractedPart[]> {
    const name = file.originalname.toLowerCase()
    const buf = file.buffer

    if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: buf })
      try {
        const result = await parser.getText()
        const text = (result.text ?? '').trim()
        if (!text) throw new BadRequestException('PDF không có text (có thể là file scan ảnh).')
        return [{ content: text, modality: 'text' }]
      } finally {
        await parser.destroy().catch(() => {})
      }
    }

    if (/\.(png|jpe?g)$/.test(name) || file.mimetype.startsWith('image/')) {
      const caption = await this.captionImage(workspaceId, buf, file.mimetype, file.originalname)
      return [{ content: caption, modality: 'image' }]
    }

    if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
      const text = buf.toString('utf-8').trim()
      if (!text) throw new BadRequestException('File CSV rỗng.')
      return [{ content: text, modality: 'table' }]
    }

    const text = buf.toString('utf-8')
    if (!text.trim()) throw new BadRequestException('File rỗng hoặc không đọc được dạng text.')
    return [{ content: text, modality: 'text' }]
  }

  private async extractFromUrl(url: string): Promise<{ title: string; text: string }> {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      throw new BadRequestException('URL không hợp lệ.')
    }
    if (!['http:', 'https:'].includes(u.protocol)) {
      throw new BadRequestException('Chỉ hỗ trợ URL http/https.')
    }
    let res: Response
    try {
      res = await fetchTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, FETCH_TIMEOUT_MS)
    } catch {
      throw new BadRequestException('Không tải được URL. Kiểm tra lại đường dẫn.')
    }
    if (!res.ok) throw new BadRequestException(`Không tải được URL (HTTP ${res.status}).`)
    const html = await res.text()
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().slice(0, 200)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length < 50) {
      throw new BadRequestException('Không trích xuất được nội dung từ URL này.')
    }
    return { title, text: text.slice(0, 200000) }
  }

  /**
   * Caption ảnh bằng model vision của provider đã kết nối (best-effort).
   * Không có provider vision → dùng tên file.
   */
  private async captionImage(
    workspaceId: string,
    buf: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    try {
      const conns = await this.prisma.aiConnection.findMany({
        where: { workspaceId, status: 'active' },
      })
      const pick =
        conns.find((c) => c.provider === 'gemini') ??
        conns.find((c) => ['openai', 'xai', 'deepseek'].includes(c.provider))
      if (!pick) return `[IMAGE: ${filename}]`
      const meta = getProviderMeta(pick.provider)
      if (!meta) return `[IMAGE: ${filename}]`
      const apiKey = decrypt(pick.keyCipher)
      const b64 = buf.toString('base64')
      const prompt = 'Mô tả ngắn gọn nội dung chính của ảnh này bằng tiếng Việt (1-2 câu).'

      if (meta.kind === 'gemini') {
        const res = await fetchTimeout(
          `${meta.baseUrl}/v1beta/models/${encodeURIComponent(meta.defaultModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: b64 } }] }],
              generationConfig: { maxOutputTokens: 300 },
            }),
          },
          FETCH_TIMEOUT_MS,
        )
        if (!res.ok) return `[IMAGE: ${filename}]`
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const caption =
          data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''
        return caption ? `[IMAGE: ${filename}] ${caption}` : `[IMAGE: ${filename}]`
      }

      // OpenAI-compatible vision
      const res = await fetchTimeout(`${meta.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: meta.defaultModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64}` } },
              ],
            },
          ],
          max_tokens: 300,
        }),
      }, FETCH_TIMEOUT_MS)
      if (!res.ok) return `[IMAGE: ${filename}]`
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const caption = data.choices?.[0]?.message?.content?.trim() ?? ''
      return caption ? `[IMAGE: ${filename}] ${caption}` : `[IMAGE: ${filename}]`
    } catch {
      return `[IMAGE: ${filename}]`
    }
  }

  /**
   * GraphRAG: trích entity/relation bằng LLM (best-effort — lỗi không block ingest).
   * Communities được gom theo type entity.
   */
  private async buildGraph(
    workspaceId: string,
    documentId: string,
    chunks: ExtractedPart[],
  ): Promise<void> {
    try {
      const provider = await this.resolveProvider(workspaceId)
      const sample = chunks
        .map((c, i) => `[Đoạn ${i + 1}]\n${c.content.slice(0, 600)}`)
        .join('\n\n')
      const res = await this.aiService.chat(workspaceId, {
        provider,
        messages: [
          {
            role: 'system',
            content:
              'Bạn trích xuất tri thức từ văn bản để xây knowledge graph. Trả về DUY NHẤT một JSON hợp lệ, không thêm text khác: {"entities":[{"name":"...","type":"person|org|concept|product|location|other","summary":"mô tả ngắn"}],"relations":[{"from":"tên entity nguồn","to":"tên entity đích","relation":"quan hệ ngắn gọn","description":"mô tả"}]}. Tối đa 12 entities và 10 relations. Bỏ qua entity chung chung vô nghĩa.',
          },
          { role: 'user', content: `VĂN BẢN:\n${sample}` },
        ],
        maxTokens: 1500,
      })
      const parsed = extractJson(res.content)
      const entities: Array<{ name?: string; type?: string; summary?: string }> =
        Array.isArray(parsed?.entities) ? parsed.entities.slice(0, 12) : []
      const relations: Array<{ from?: string; to?: string; relation?: string; description?: string }> =
        Array.isArray(parsed?.relations) ? parsed.relations.slice(0, 10) : []
      if (entities.length === 0) return

      const created = await this.prisma.$transaction(
        entities
          .filter((e) => e?.name && String(e.name).trim())
          .map((e) =>
            this.prisma.entity.create({
              data: {
                workspaceId,
                documentId,
                name: String(e.name).slice(0, 120),
                type: ['person', 'org', 'concept', 'product', 'location'].includes(e.type ?? '')
                  ? (e.type as string)
                  : 'other',
                summary: e.summary ? String(e.summary).slice(0, 500) : null,
              },
            }),
          ),
      )
      if (created.length === 0) return

      const byName = new Map(created.map((e) => [e.name.toLowerCase(), e.id]))
      const relRows = relations
        .map((r) => ({
          fromId: byName.get(String(r.from ?? '').toLowerCase()),
          toId: byName.get(String(r.to ?? '').toLowerCase()),
          relation: String(r.relation ?? 'liên quan').slice(0, 80),
          description: r.description ? String(r.description).slice(0, 300) : null,
        }))
        .filter((r) => r.fromId && r.toId && r.fromId !== r.toId)
      if (relRows.length > 0) {
        await this.prisma.relation.createMany({
          data: relRows.map((r) => ({
            workspaceId,
            fromId: r.fromId as string,
            toId: r.toId as string,
            relation: r.relation,
            description: r.description,
          })),
        })
      }

      // Communities: gom entity theo type
      const typeLabel: Record<string, string> = {
        person: 'con người',
        org: 'tổ chức',
        concept: 'khái niệm',
        product: 'sản phẩm',
        location: 'địa điểm',
        other: 'khác',
      }
      const byType = new Map<string, typeof created>()
      for (const e of created) {
        const g = byType.get(e.type) ?? []
        g.push(e)
        byType.set(e.type, g)
      }
      for (const [type, list] of byType) {
        await this.prisma.community.create({
          data: {
            workspaceId,
            title: `Nhóm ${typeLabel[type] ?? type}`,
            summary: `Gồm ${list.length} thực thể: ${list.map((e) => e.name).slice(0, 10).join(', ')}`,
            entityIds: list.map((e) => e.id),
          },
        })
      }
    } catch {
      // best-effort: bỏ qua mọi lỗi
    }
  }
}

// ─── Module-level helpers ───────────────────────────────────────────────────

/** Chunking recursive: ~800 ký tự, overlap 100. */
function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const out: string[] = []
  const paras = text.split(/\n{2,}|\r?\n/).map((p) => p.trim()).filter(Boolean)
  let cur = ''
  const push = (s: string) => {
    if (s.trim()) out.push(s)
  }
  for (const p of paras) {
    if ((cur + '\n' + p).length <= size) {
      cur = cur ? cur + '\n' + p : p
      continue
    }
    if (cur) push(cur)
    if (p.length > size) {
      const sentences = p.split(/(?<=[.!?。])\s+/)
      cur = ''
      for (const s of sentences) {
        if ((cur + ' ' + s).length <= size) {
          cur = cur ? cur + ' ' + s : s
        } else {
          if (cur) push(cur)
          cur = s.length > size ? s.slice(0, size) : s
        }
      }
    } else {
      cur = p
    }
  }
  if (cur) push(cur)

  // Overlap: nối đuôi chunk trước vào đầu chunk sau
  if (overlap > 0 && out.length > 1) {
    for (let i = 1; i < out.length; i++) {
      out[i] = out[i - 1].slice(-overlap) + '\n' + out[i]
    }
  }
  return out.filter((c) => c.trim().length > 0)
}

function toSources(chunks: RetrievedChunk[]): RagSource[] {
  return chunks.map((c) => ({
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    chunkId: c.id,
    score: c.score,
    modality: c.modality,
  }))
}
