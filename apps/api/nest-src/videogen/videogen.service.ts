import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { AiService } from '../ai/ai.service'
import {
  getProviderMeta,
  type AiProviderMeta,
  type AiProviderId,
} from '../ai/ai.providers'
import { fetchTimeout } from '../common/safe-fetch'
import { parseJsonLoose, pcmToWav, dataUrlParts, sleep } from './utils'
import type { ScriptDto, ImageDto, VoiceDto, ClipDto } from './dto'

/**
 * VideogenService — "Studio tạo video": sinh kịch bản / ảnh / giọng đọc /
 * clip AI ngay trên web bằng API key Pro user đã kết nối (server-side,
 * key không bao giờ về frontend).
 *
 * Khả năng theo provider (key đã kết nối):
 * - gemini : chat + image (Nano Banana) + voice (Gemini TTS) + video (Veo 3.1)
 * - openai : chat + image (GPT Image) + voice (OpenAI TTS) + video (Sora 2)
 * - xai / anthropic / deepseek / experientiallabs / apmix: chỉ chat
 *   (gateway OpenAI-compatible không đảm bảo có image/voice/video).
 */

const IMAGE_TIMEOUT_MS = 180_000
const VOICE_TIMEOUT_MS = 120_000
const CLIP_POLL_MS = 10_000
const CLIP_MAX_MS = 12 * 60_000

type Capability = 'chat' | 'image' | 'voice' | 'video'

const CAPABILITIES: Record<string, Capability[]> = {
  gemini: ['chat', 'image', 'voice', 'video'],
  openai: ['chat', 'image', 'voice', 'video'],
  xai: ['chat'],
  anthropic: ['chat'],
  deepseek: ['chat'],
  experientiallabs: ['chat'],
  apmix: ['chat'],
}

/** Thứ tự ưu tiên khi user để provider='auto' */
const AUTO_ORDER: AiProviderId[] = ['gemini', 'openai']

export interface SceneOut {
  text: string
  imagePrompt: string
  camera: string
  seconds: number
}

interface ClipJob {
  id: string
  workspaceId: string
  provider: string
  model: string
  status: 'processing' | 'done' | 'failed'
  progress: string
  error?: string
  buffer?: Buffer
  mime?: string
  createdAt: number
}

@Injectable()
export class VideogenService {
  private jobs = new Map<string, ClipJob>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly ai: AiService,
  ) {}

  // ─── Providers & capabilities ──────────────────────────────────────────

  /** Provider nào đã kết nối + làm được gì — để UI hiển thị/khuyên chọn. */
  async providers(workspaceId: string) {
    const conns = await this.prisma.aiConnection.findMany({
      where: { workspaceId, status: 'active' },
      select: { provider: true, keyHint: true, validatedAt: true },
    })
    const connected = new Set(conns.map((c) => c.provider))
    const all: AiProviderId[] = [
      'gemini',
      'openai',
      'xai',
      'anthropic',
      'deepseek',
      'experientiallabs',
      'apmix',
    ]
    return all.map((id) => {
      const meta = getProviderMeta(id)
      const conn = conns.find((c) => c.provider === id)
      return {
        id,
        name: meta?.name ?? id,
        connected: connected.has(id),
        keyHint: conn?.keyHint ?? null,
        capabilities: connected.has(id) ? (CAPABILITIES[id] ?? ['chat']) : [],
      }
    })
  }

  /** Chọn provider: ưu tiên provider được chỉ định (nếu đủ capability + đã kết nối),
   *  nếu không thì tự fallback sang AUTO_ORDER (Gemini → OpenAI) thay vì báo lỗi. */
  private async resolveProvider(
    workspaceId: string,
    requested: string | undefined,
    need: Capability,
  ): Promise<{ meta: AiProviderMeta; apiKey: string; connId: string }> {
    const tried: string[] = []
    const ordered: AiProviderId[] = requested
      ? [requested as AiProviderId, ...AUTO_ORDER.filter((id) => id !== requested)]
      : AUTO_ORDER

    for (const id of ordered) {
      const meta = getProviderMeta(id)
      if (!meta) continue
      if (!(CAPABILITIES[id] ?? []).includes(need)) {
        tried.push(`${meta.name} (không hỗ trợ ${need})`)
        continue
      }
      try {
        return await this.ai.getChatKey(workspaceId, id)
      } catch {
        tried.push(`${meta.name} (chưa kết nối)`)
      }
    }
    const needVi: Record<Capability, string> = {
      chat: 'viết kịch bản',
      image: 'sinh ảnh',
      voice: 'sinh giọng đọc',
      video: 'sinh clip AI',
    }
    throw new BadRequestException(
      `Không có key nào dùng được để ${needVi[need]}.` +
        (tried.length ? ` Đã thử: ${tried.join('; ')}.` : '') +
        ' Hãy vào Cài đặt → AI Pro để kết nối key ' +
        (need === 'chat' ? '(bất kỳ)' : 'Gemini hoặc OpenAI') +
        '.',
    )
  }

  private sanitize(message: string, apiKey: string): string {
    const t = message.length > 500 ? message.slice(0, 500) + '…' : message
    return t.split(apiKey).join('[redacted]')
  }

  private async log(
    workspaceId: string,
    action: string,
    provider: string,
    metadata: Record<string, unknown>,
    ip?: string,
  ) {
    await this.audit
      .log({
        workspaceId,
        actorId: workspaceId,
        action,
        provider,
        entityType: 'videogen',
        result: 'success',
        metadata,
        ip,
      })
      .catch(() => {})
  }

  // ─── 1. Kịch bản ───────────────────────────────────────────────────────

  async script(
    workspaceId: string,
    dto: ScriptDto,
    ip?: string,
  ): Promise<{ provider: string; model: string; title: string; scenes: SceneOut[] }> {
    const duration = dto.duration ?? 45
    const nScenes = { 15: 3, 30: 4, 45: 5, 60: 7, 90: 9, 120: 11, 180: 13 }[
      duration
    ] ?? 5
    const sys =
      `Bạn là biên kịch video faceless tiếng Việt. Trả về DUY NHẤT JSON hợp lệ, không markdown: ` +
      `{"title":"","scenes":[{"text":"","image_prompt":"","camera":""} x ${nScenes}]}. ` +
      `"text" là LỜI THOẠI tiếng Việt để TTS đọc (tự nhiên, có nhịp, không icon). ` +
      `"image_prompt" là prompt ẢNH TIẾNG ANH chi tiết cho ảnh dọc 9:16 (mô tả cảnh, ánh sáng, phong cách điện ảnh, KHÔNG chữ trong ảnh). ` +
      `"camera" là chuyển động máy quay ngắn (VD: slow push-in). Tổng thời lượng đọc xấp xỉ ${duration} giây.`
    const user =
      `Chủ đề: ${dto.topic}\n` +
      (dto.niche ? `Niche: ${dto.niche}\n` : '') +
      (dto.sourceScript?.trim()
        ? `KỊCH BẢN NGUỒN (đã duyệt từ pipeline Video Faceless — BÁM SÁT nội dung, góc nhìn, cấu trúc và các điểm chính của kịch bản này; chỉ chuyển thành lời thoại TTS tự nhiên + image_prompt tương ứng từng scene, KHÔNG bịa thêm luận điểm mới):\n${dto.sourceScript.trim().slice(0, 8000)}\n`
        : '') +
      `Thời lượng: ${duration}s, ${nScenes} scene.`

    const { meta } = await this.resolveProvider(
      workspaceId,
      dto.provider,
      'chat',
    )
    // Dùng ai.chat để hưởng fallback combo key có sẵn (key giải mã ở server)
    const res = await this.ai.chat(
      workspaceId,
      {
        provider: meta.id,
        model: meta.defaultModel,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        maxTokens: 4096,
      },
      ip,
    )
    let data: any
    try {
      data = parseJsonLoose(res.content)
    } catch {
      throw new HttpException(
        'AI không trả về kịch bản đúng định dạng. Hãy thử lại.',
        HttpStatus.BAD_GATEWAY,
      )
    }
    const rawScenes = Array.isArray(data.scenes) ? data.scenes : []
    if (!rawScenes.length) {
      throw new HttpException(
        'AI trả về kịch bản rỗng. Hãy thử lại.',
        HttpStatus.BAD_GATEWAY,
      )
    }
    const perScene = Math.max(3, Math.round(duration / rawScenes.length))
    const scenes: SceneOut[] = rawScenes.slice(0, 14).map((s: any) => ({
      text: String(s.text ?? ''),
      imagePrompt: String(s.image_prompt ?? s.imagePrompt ?? ''),
      camera: String(s.camera ?? 'slow push-in'),
      seconds: perScene,
    }))
    await this.log(
      workspaceId,
      'videogen_script',
      meta.id,
      { model: res.model, scenes: scenes.length, topicLen: dto.topic.length, sourceLen: dto.sourceScript?.length ?? 0 },
      ip,
    )
    return { provider: meta.id, model: res.model, title: String(data.title ?? dto.topic), scenes }
  }

  // ─── 2. Ảnh ────────────────────────────────────────────────────────────

  async image(
    workspaceId: string,
    dto: ImageDto,
    ip?: string,
  ): Promise<{ provider: string; model: string; url: string; mime: string }> {
    const { meta, apiKey } = await this.resolveProvider(
      workspaceId,
      dto.provider,
      'image',
    )
    const ratio = dto.aspectRatio ?? '9:16'
    const prompt =
      `${dto.prompt}. Vertical composition 9:16, cinematic lighting, ultra detailed, no text, no watermark.`

    try {
      if (meta.kind === 'gemini') {
        return await this.imageGemini(meta, apiKey, prompt, ratio, workspaceId, ip)
      }
      return await this.imageOpenAi(meta, apiKey, prompt, ratio, workspaceId, ip)
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException(
        `Không sinh được ảnh qua ${meta.name}. Hãy thử lại sau.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  private async imageGemini(
    meta: AiProviderMeta,
    apiKey: string,
    prompt: string,
    ratio: string,
    workspaceId: string,
    ip?: string,
  ) {
    // Nano Banana: generateContent với responseModalities IMAGE (free tier dùng được)
    const model = 'gemini-2.5-flash-image'
    const url =
      `${meta.baseUrl}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetchTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: ratio },
          },
        }),
      },
      IMAGE_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) {
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitize(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const data = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>
    }
    const part = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) {
      throw new HttpException(
        `${meta.name} không trả về ảnh (có thể bị bộ lọc). Hãy sửa prompt.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const mime = part.inlineData.mimeType ?? 'image/png'
    await this.log(workspaceId, 'videogen_image', meta.id, { model, ratio }, ip)
    return {
      provider: meta.id,
      model,
      url: `data:${mime};base64,${part.inlineData.data}`,
      mime,
    }
  }

  private async imageOpenAi(
    meta: AiProviderMeta,
    apiKey: string,
    prompt: string,
    ratio: string,
    workspaceId: string,
    ip?: string,
  ) {
    const model = 'gpt-image-1'
    const size = ratio === '16:9' ? '1536x1024' : ratio === '1:1' ? '1024x1024' : '1024x1536'
    const res = await fetchTimeout(
      `${meta.baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          response_format: 'b64_json',
          n: 1,
        }),
      },
      IMAGE_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) {
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitize(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const data = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> }
    const d = data.data?.[0]
    if (!d || (!d.b64_json && !d.url)) {
      throw new HttpException(`${meta.name} không trả về ảnh.`, HttpStatus.BAD_GATEWAY)
    }
    await this.log(workspaceId, 'videogen_image', meta.id, { model, ratio }, ip)
    return {
      provider: meta.id,
      model,
      url: d.b64_json ? `data:image/png;base64,${d.b64_json}` : (d.url as string),
      mime: 'image/png',
    }
  }

  // ─── 3. Giọng đọc ──────────────────────────────────────────────────────

  async voice(
    workspaceId: string,
    dto: VoiceDto,
    ip?: string,
  ): Promise<{ provider: string; model: string; audioBase64: string; mime: string }> {
    const { meta, apiKey } = await this.resolveProvider(
      workspaceId,
      dto.provider,
      'voice',
    )
    try {
      if (meta.kind === 'gemini') {
        return await this.voiceGemini(meta, apiKey, dto, workspaceId, ip)
      }
      return await this.voiceOpenAi(meta, apiKey, dto, workspaceId, ip)
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException(
        `Không sinh được giọng đọc qua ${meta.name}. Hãy thử lại sau.`,
        HttpStatus.BAD_GATEWAY,
      )
    }
  }

  private async voiceGemini(
    meta: AiProviderMeta,
    apiKey: string,
    dto: VoiceDto,
    workspaceId: string,
    ip?: string,
  ) {
    const model = 'gemini-2.5-flash-preview-tts'
    const url =
      `${meta.baseUrl}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetchTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: dto.text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: dto.voice || 'Kore' },
              },
            },
          },
        }),
      },
      VOICE_TIMEOUT_MS,
    )
    const text = await res.text()
    if (!res.ok) {
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitize(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const data = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>
    }
    const part = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) {
      throw new HttpException(`${meta.name} không trả về audio.`, HttpStatus.BAD_GATEWAY)
    }
    // audio/L16;codec=pcm;rate=24000 → bọc WAV để phát trực tiếp được
    const mime = part.inlineData.mimeType ?? 'audio/L16;rate=24000'
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000)
    const pcm = Buffer.from(part.inlineData.data, 'base64')
    const wav = pcmToWav(pcm, rate)
    await this.log(
      workspaceId,
      'videogen_voice',
      meta.id,
      { model, voice: dto.voice || 'Kore', textLen: dto.text.length },
      ip,
    )
    return {
      provider: meta.id,
      model,
      audioBase64: wav.toString('base64'),
      mime: 'audio/wav',
    }
  }

  private async voiceOpenAi(
    meta: AiProviderMeta,
    apiKey: string,
    dto: VoiceDto,
    workspaceId: string,
    ip?: string,
  ) {
    const model = 'gpt-4o-mini-tts'
    const res = await fetchTimeout(
      `${meta.baseUrl}/audio/speech`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          voice: dto.voice || 'alloy',
          input: dto.text,
          response_format: 'mp3',
        }),
      },
      VOICE_TIMEOUT_MS,
    )
    if (!res.ok) {
      const text = await res.text()
      throw new HttpException(
        `${meta.name} trả lỗi ${res.status}: ${this.sanitize(text, apiKey)}`,
        HttpStatus.BAD_GATEWAY,
      )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await this.log(
      workspaceId,
      'videogen_voice',
      meta.id,
      { model, voice: dto.voice || 'alloy', textLen: dto.text.length },
      ip,
    )
    return {
      provider: meta.id,
      model,
      audioBase64: buf.toString('base64'),
      mime: 'audio/mpeg',
    }
  }

  // ─── 4. Clip AI (Veo / Sora) — job dài, poll ────────────────────────────

  /** POST /videogen/clip — khởi job, trả jobId để frontend poll. */
  async startClip(
    workspaceId: string,
    dto: ClipDto,
    ip?: string,
  ): Promise<{ jobId: string; provider: string; model: string }> {
    const { meta, apiKey } = await this.resolveProvider(
      workspaceId,
      dto.provider,
      'video',
    )
    const model = meta.kind === 'gemini' ? 'veo-3.1-fast-generate-preview' : 'sora-2'
    const job: ClipJob = {
      id: randomUUID(),
      workspaceId,
      provider: meta.id,
      model,
      status: 'processing',
      progress: 'Đang khởi tạo…',
      createdAt: Date.now(),
    }
    this.jobs.set(job.id, job)
    this.cleanupJobs()
    // Chạy nền — không await
    this.runClipJob(job, meta, apiKey, dto, ip).catch((err) => {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
    })
    await this.log(
      workspaceId,
      'videogen_clip_start',
      meta.id,
      { model, seconds: dto.seconds ?? 8 },
      ip,
    )
    return { jobId: job.id, provider: meta.id, model }
  }

  getClip(workspaceId: string, jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException('Không tìm thấy job.')
    }
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error ?? null,
      provider: job.provider,
      model: job.model,
    }
  }

  downloadClip(workspaceId: string, jobId: string): { buffer: Buffer; mime: string } {
    const job = this.jobs.get(jobId)
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException('Không tìm thấy job.')
    }
    if (job.status !== 'done' || !job.buffer) {
      throw new BadRequestException('Clip chưa xong.')
    }
    return { buffer: job.buffer, mime: job.mime ?? 'video/mp4' }
  }

  private cleanupJobs() {
    const cutoff = Date.now() - 2 * 60 * 60_000
    for (const [id, job] of this.jobs) {
      if (job.createdAt < cutoff) this.jobs.delete(id)
    }
  }

  private async runClipJob(
    job: ClipJob,
    meta: AiProviderMeta,
    apiKey: string,
    dto: ClipDto,
    ip?: string,
  ) {
    try {
      const buf =
        meta.kind === 'gemini'
          ? await this.clipVeo(job, meta, apiKey, dto)
          : await this.clipSora(job, meta, apiKey, dto)
      job.buffer = buf
      job.mime = 'video/mp4'
      job.status = 'done'
      job.progress = 'Hoàn tất'
      await this.log(
        job.workspaceId,
        'videogen_clip_done',
        meta.id,
        { model: job.model, bytes: buf.length },
        ip,
      )
    } catch (err) {
      job.status = 'failed'
      const msg = err instanceof Error ? err.message : String(err)
      job.error = this.sanitize(msg, apiKey)
      throw err
    }
  }

  private async clipVeo(
    job: ClipJob,
    meta: AiProviderMeta,
    apiKey: string,
    dto: ClipDto,
  ): Promise<Buffer> {
    const key = encodeURIComponent(apiKey)
    const instance: Record<string, unknown> = { prompt: dto.prompt }
    const img = dto.imageDataUrl ? dataUrlParts(dto.imageDataUrl) : null
    if (img) {
      instance.image = { inlineData: { mimeType: img.mime, data: img.b64 } }
    }
    const started = Date.now()
    const createRes = await fetchTimeout(
      `${meta.baseUrl}/v1beta/models/${job.model}:predictLongRunning?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [instance],
          parameters: {
            aspectRatio: dto.aspectRatio ?? '9:16',
            durationSeconds: dto.seconds ?? 8,
          },
        }),
      },
      60_000,
    )
    const createText = await createRes.text()
    if (!createRes.ok) {
      throw new Error(`Veo từ chối tạo clip: ${this.sanitize(createText, apiKey)}`)
    }
    const op = JSON.parse(createText) as { name?: string }
    if (!op.name) throw new Error('Veo không trả về operation.')

    while (Date.now() - started < CLIP_MAX_MS) {
      await sleep(CLIP_POLL_MS)
      job.progress = `Veo đang render… (${Math.round((Date.now() - started) / 1000)}s)`
      const stRes = await fetchTimeout(
        `${meta.baseUrl}/v1beta/${op.name}?key=${key}`,
        {},
        30_000,
      )
      const stText = await stRes.text()
      if (!stRes.ok) throw new Error(`Veo poll lỗi: ${this.sanitize(stText, apiKey)}`)
      const st = JSON.parse(stText) as {
        done?: boolean
        error?: { message?: string }
        response?: any
      }
      if (st.error) throw new Error(`Veo lỗi: ${st.error.message ?? ''}`)
      if (st.done) {
        const uri =
          st.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        if (!uri) throw new Error('Veo xong nhưng không tìm thấy video.')
        const dl = await fetchTimeout(
          uri,
          { headers: { 'x-goog-api-key': apiKey } },
          120_000,
        )
        if (!dl.ok) throw new Error(`Tải clip Veo thất bại (HTTP ${dl.status}).`)
        return Buffer.from(await dl.arrayBuffer())
      }
    }
    throw new Error('Veo quá 12 phút chưa xong — hãy thử lại sau.')
  }

  private async clipSora(
    job: ClipJob,
    meta: AiProviderMeta,
    apiKey: string,
    dto: ClipDto,
  ): Promise<Buffer> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    const size = dto.aspectRatio === '16:9' ? '1280x720' : '720x1280'
    const createRes = await fetchTimeout(
      `${meta.baseUrl}/videos`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: job.model,
          prompt: dto.prompt,
          seconds: dto.seconds ?? 8,
          size,
        }),
      },
      60_000,
    )
    const createText = await createRes.text()
    if (!createRes.ok) {
      throw new Error(`Sora từ chối tạo clip: ${this.sanitize(createText, apiKey)}`)
    }
    const created = JSON.parse(createText) as { id?: string }
    if (!created.id) throw new Error('Sora không trả về video id.')

    const started = Date.now()
    let status = ''
    while (Date.now() - started < CLIP_MAX_MS) {
      await sleep(CLIP_POLL_MS)
      const stRes = await fetchTimeout(
        `${meta.baseUrl}/videos/${created.id}`,
        { headers },
        30_000,
      )
      const stText = await stRes.text()
      if (!stRes.ok) throw new Error(`Sora poll lỗi: ${this.sanitize(stText, apiKey)}`)
      const st = JSON.parse(stText) as {
        status?: string
        progress?: number
        error?: { message?: string }
      }
      status = st.status ?? ''
      job.progress =
        `Sora đang render…` +
        (st.progress != null ? ` ${Math.round(st.progress * 100)}%` : '') +
        ` (${Math.round((Date.now() - started) / 1000)}s)`
      if (status === 'completed') break
      if (status === 'failed') {
        throw new Error(`Sora lỗi: ${st.error?.message ?? 'không rõ'}`)
      }
    }
    if (status !== 'completed') throw new Error('Sora quá 12 phút chưa xong — hãy thử lại sau.')

    const dl = await fetchTimeout(
      `${meta.baseUrl}/videos/${created.id}/content`,
      { headers },
      180_000,
    )
    if (!dl.ok) throw new Error(`Tải clip Sora thất bại (HTTP ${dl.status}).`)
    return Buffer.from(await dl.arrayBuffer())
  }
}
