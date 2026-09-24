'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Send,
  Loader2,
  Bot,
  User as UserIcon,
  Sparkles,
  AlertCircle,
  KeyRound,
  ChevronDown,
  FileText,
  Table,
  Image as ImageIcon,
  AlertTriangle,
  BookOpen,
  Wrench,
  History,
  Plus,
  X,
  Pencil,
  Trash2,
  Clapperboard,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { extractShootScript, extractPublishCaption } from '../../components/AICopilotStudio'
import {
  useAiProviders,
  useAiConnections,
  sendAiChat,
  sendAgentRun,
  useRagDocuments,
  queryRag,
  listChatSessions,
  createChatSession,
  getChatSession,
  appendChatMessages,
  renameChatSession,
  deleteChatSession,
  deleteChatMessage,
  clearAllChatSessions,
  createVideoProjectFromAgent,
} from '../../lib/hooks'
import { ApiError } from '../../lib/api'
import type {
  ChatMessage,
  ChatSession,
  ChatHistoryMeta,
  RagQueryResult,
  RagStrategy,
  AgentRunResponse,
} from '../../lib/types'

/** Thời gian tương đối tiếng Việt: "5 phút trước", "2 giờ trước"… */
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

/** Render markdown cơ bản — escape HTML trước để chống XSS. */
function renderMarkdown(text: string): React.ReactNode[] {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const inline = (s: string): string => {
    let out = escape(s)
    out = out.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-dark-950/80 border border-white/10 text-brand-cyan text-[12px] font-mono">$1</code>')
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    return out
  }

  const blocks: React.ReactNode[] = []
  // Tách code block ``` trước
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g)
  parts.forEach((part, i) => {
    if (i % 3 === 2) {
      // nội dung code
      blocks.push(
        <pre key={i} className="my-2 p-3 rounded-xl bg-dark-950/80 border border-white/10 overflow-x-auto text-[12px] font-mono text-slate-200 whitespace-pre-wrap">
          {part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </pre>,
      )
    } else if (i % 3 === 0 && part) {
      const lines = part.split('\n')
      const htmlLines = lines.map((line) => {
        if (/^\s*[-*]\s+/.test(line)) {
          return `<li class="ml-4 list-disc">${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          return `<li class="ml-4 list-decimal">${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`
        }
        if (/^#{1,3}\s+/.test(line)) {
          return `<div class="font-bold text-white mt-1">${inline(line.replace(/^#{1,3}\s+/, ''))}</div>`
        }
        return inline(line) || '<br/>'
      })
      blocks.push(
        <div key={i} dangerouslySetInnerHTML={{ __html: htmlLines.join('<br/>') }} />,
      )
    }
  })
  return blocks
}

/* ─── RAG ─────────────────────────────────────────────────────────────── */

/** 5 kiến trúc RAG theo contract backend. */
const RAG_STRATEGIES: { id: RagStrategy; name: string; description: string }[] = [
  { id: 'hybrid', name: 'Hybrid RAG', description: 'Vector ngữ nghĩa + từ khóa, hợp nhất bằng Reciprocal Rank Fusion' },
  { id: 'graph', name: 'GraphRAG', description: 'Trả lời nằm trong quan hệ: trích thực thể, duyệt đồ thị 2 bước' },
  { id: 'agentic', name: 'Agentic RAG', description: 'Retrieval thành kế hoạch: agent tự gọi công cụ nhiều vòng' },
  { id: 'corrective', name: 'Corrective RAG', description: 'Chấm điểm từng đoạn trước khi tin, viết lại câu hỏi khi cần' },
  { id: 'multimodal', name: 'Multimodal RAG', description: 'Một index thống nhất cho text, bảng và ảnh' },
]

const modalityIcon = {
  text: FileText,
  table: Table,
  image: ImageIcon,
} as const

/** Khối "Nguồn tham khảo" + "Các bước agent" dưới câu trả lời ở chế độ RAG. */
function RagMetaBlocks({ meta }: { meta: RagQueryResult }) {
  return (
    <div className="mt-3 space-y-3">
      {meta.sources.length > 0 && (
        <div className="rounded-xl bg-dark-900/70 border border-white/10 p-3">
          <p className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wide mb-2">
            Nguồn tham khảo
          </p>
          <div className="space-y-1.5">
            {meta.sources.map((s, i) => {
              const Icon = modalityIcon[s.modality] ?? FileText
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Icon className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                  <span className="text-slate-200 font-medium truncate flex-1">
                    {s.documentTitle}
                  </span>
                  <span className="text-brand-emerald font-bold font-mono shrink-0">
                    {(s.score * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-600 font-mono text-[10px] shrink-0">
                    {s.chunkId.slice(0, 8)}…
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {meta.steps && meta.steps.length > 0 && (
        <div className="rounded-xl bg-dark-900/70 border border-white/10 p-3">
          <p className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wide mb-2">
            Các bước agent
          </p>
          <div className="space-y-1.5">
            {meta.steps.map((step, i) => {
              const args =
                typeof step.args === 'string' ? step.args : JSON.stringify(step.args)
              return (
                <div key={i} className="text-xs font-mono">
                  <span className="text-brand-violet font-bold">{step.tool}</span>
                  <span className="text-slate-500">
                    {' '}
                    {args.length > 80 ? `${args.slice(0, 80)}…` : args}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {meta.outsideKnowledge && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Trả lời có dùng kiến thức ngoài kho tài liệu.</span>
        </div>
      )}
    </div>
  )
}

/* ─── Agent ───────────────────────────────────────────────────────────── */

/** Dòng thông báo khi server tự chuyển sang provider dự phòng (combo key). */
function FallbackNotice({
  fallback,
  nameOf,
}: {
  fallback: { from: string; to: string; reason?: string }
  nameOf: (id: string) => string
}) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2">
      <span className="text-amber-400 text-xs mt-0.5">⚠️</span>
      <p className="text-xs text-amber-200/90 leading-relaxed">
        {nameOf(fallback.from)} gặp lỗi nên đã tự động chuyển sang {nameOf(fallback.to)}.
        {fallback.reason && <span className="text-amber-200/60"> ({fallback.reason})</span>}
      </p>
    </div>
  )
}

/** Khối "Quá trình agent" dưới câu trả lời ở chế độ Agent: các tool đã gọi. */
function AgentMetaBlocks({
  meta,
  nameOf,
}: {
  meta: AgentRunResponse
  nameOf: (id: string) => string
}) {
  return (
    <div className="mt-3 space-y-3">
      {meta.fallback && <FallbackNotice fallback={meta.fallback} nameOf={nameOf} />}
      <div className="rounded-xl bg-dark-900/70 border border-white/10 p-3">
        <p className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wide mb-2">
          Quá trình agent · {meta.turns} vòng · {meta.toolCalls.length} tool
        </p>
        <div className="space-y-1.5">
          {meta.toolCalls.map((t, i) => (
            <div key={i} className="text-xs font-mono flex items-start gap-2">
              <span
                className={`shrink-0 font-bold ${
                  t.ok ? 'text-brand-emerald' : 'text-red-400'
                }`}
              >
                {t.ok ? '✓' : '✗'}
              </span>
              <span className="text-brand-violet font-bold shrink-0">{t.name}</span>
              <span className="text-slate-500 truncate flex-1">
                {t.output.length > 90 ? `${t.output.slice(0, 90)}…` : t.output}
                {t.truncated && ' (đã cắt ngắn)'}
              </span>
              <span className="text-slate-600 shrink-0">{t.ms}ms</span>
            </div>
          ))}
          {meta.toolCalls.length === 0 && (
            <p className="text-xs text-slate-500">Agent trả lời trực tiếp, không gọi tool.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AiChatPage() {
  const { providers } = useAiProviders()
  const { connections, loading } = useAiConnections()
  const [providerId, setProviderId] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mappingIdx, setMappingIdx] = useState<number | null>(null)
  const router = useRouter()

  /** Mapping tin nhắn agent → Video Faceless: tạo project, nạp script + caption, mở pipeline. */
  const handleMapToVideo = async (idx: number, content: string) => {
    const script = extractShootScript(content)
    const caption = extractPublishCaption(content)
    if (!script && !caption.trim()) {
      setError('Tin nhắn này không có kịch bản/caption để tạo video.')
      return
    }
    setMappingIdx(idx)
    setError(null)
    try {
      const id = await createVideoProjectFromAgent({ script, caption })
      router.push(`/video-faceless?project=${id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo dự án video thất bại.')
    } finally {
      setMappingIdx(null)
    }
  }
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Nhật ký chat (lưu lịch sử + xóa tùy ý) ──
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const persistQueue = useRef<Promise<void>>(Promise.resolve())

  const refreshSessions = async () => {
    try {
      setSessions(await listChatSessions())
    } catch {
      // Không chặn chat nếu tải lịch sử lỗi
    }
  }

  useEffect(() => {
    refreshSessions()
  }, [])

  const setSession = (id: string | null) => {
    sessionIdRef.current = id
    setSessionId(id)
  }

  /** Bắt đầu đoạn chat mới — giữ nguyên provider/model đã chọn. */
  const startNewChat = () => {
    setMessages([])
    setSession(null)
    setError(null)
    setHistoryOpen(false)
  }

  /** Lưu cặp user+assistant vào nhật ký (chạy nền, nối đuôi nhau để không tạo trùng phiên). */
  const persistHistory = (
    userContent: string,
    assistant: ChatMessage,
    msgTotal: number,
    mode: 'chat' | 'agent' | 'rag',
    pid: string,
    mdl: string,
  ) => {
    persistQueue.current = persistQueue.current
      .then(async () => {
        let sid = sessionIdRef.current
        if (!sid) {
          const created = await createChatSession({
            provider: pid,
            model: mdl || undefined,
            mode,
          })
          sid = created.id
          setSession(sid)
        }
        const meta: ChatHistoryMeta = {}
        if (assistant.fallback) meta.fallback = assistant.fallback
        if (assistant.ragMeta) meta.ragMeta = assistant.ragMeta
        if (assistant.agentMeta) meta.agentMeta = assistant.agentMeta
        const saved = await appendChatMessages(sid, [
          { role: 'user', content: userContent },
          {
            role: 'assistant',
            content: assistant.content,
            meta: Object.keys(meta).length > 0 ? meta : undefined,
          },
        ])
        const [u, a] = saved.messages
        // Gán id DB cho đúng 2 tin nhắn vừa gửi (so khớp nội dung để tránh lệch khi user xóa giữa chừng)
        setMessages((prev) => {
          if (prev.length < msgTotal || !u || !a) return prev
          const next = [...prev]
          const um = next[msgTotal - 2]
          const am = next[msgTotal - 1]
          if (um && !um.historyId && um.role === 'user' && um.content === userContent) {
            next[msgTotal - 2] = { ...um, historyId: u.id }
          }
          if (am && !am.historyId && am.role === 'assistant' && am.content === assistant.content) {
            next[msgTotal - 1] = { ...am, historyId: a.id }
          }
          return next
        })
        refreshSessions()
      })
      .catch(() => {
        // Lưu lịch sử lỗi thì bỏ qua — không chặn trải nghiệm chat
      })
  }

  /** Tải lại 1 phiên từ nhật ký. */
  const loadSession = async (id: string) => {
    setLoadingSession(true)
    setError(null)
    try {
      const detail = await getChatSession(id)
      setMessages(
        detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ragMeta: m.meta?.ragMeta,
          agentMeta: m.meta?.agentMeta,
          fallback: m.meta?.fallback,
          historyId: m.id,
        })),
      )
      setSession(id)
      if (activeMeta.some((p) => p.id === detail.provider) && detail.provider !== providerId) {
        setProviderId(detail.provider)
      }
      if (detail.model) setModel(detail.model)
      setAgentMode(detail.mode === 'agent')
      setRagMode(detail.mode === 'rag')
      setHistoryOpen(false)
    } catch {
      setError('Không tải được đoạn chat. Hãy thử lại.')
    } finally {
      setLoadingSession(false)
    }
  }

  /** Xóa 1 phiên (bấm 2 lần để xác nhận). */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const handleDeleteSession = async (id: string) => {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id)
      setTimeout(() => setConfirmingDeleteId((cur) => (cur === id ? null : cur)), 4000)
      return
    }
    setConfirmingDeleteId(null)
    try {
      await deleteChatSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (sessionIdRef.current === id) startNewChat()
    } catch {
      setError('Không xóa được đoạn chat.')
    }
  }

  /** Xóa 1 tin nhắn (trong DB nếu đã lưu, luôn xóa khỏi màn hình). */
  const handleDeleteMessage = async (index: number) => {
    const msg = messages[index]
    if (!msg) return
    if (msg.historyId && sessionIdRef.current) {
      try {
        await deleteChatMessage(sessionIdRef.current, msg.historyId)
      } catch {
        setError('Không xóa được tin nhắn.')
        return
      }
    }
    setMessages((prev) => prev.filter((_, i) => i !== index))
  }

  /** Xóa toàn bộ lịch sử. */
  const handleClearAll = async () => {
    if (!confirm('Xóa TOÀN BỘ lịch sử chat? Hành động này không thể hoàn tác.')) return
    try {
      await clearAllChatSessions()
      setSessions([])
      startNewChat()
    } catch {
      setError('Không xóa được lịch sử.')
    }
  }

  /** Lưu tên mới cho phiên. */
  const submitRename = async (id: string) => {
    const title = renameValue.trim()
    setRenamingId(null)
    if (!title) return
    try {
      const updated = await renameChatSession(id, title)
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: updated.title } : s)))
    } catch {
      setError('Không đổi được tên.')
    }
  }

  // ── Chế độ RAG ──
  const [ragMode, setRagMode] = useState(false)
  const [ragStrategy, setRagStrategy] = useState<RagStrategy>('hybrid')
  const { documents: ragDocs, loading: ragDocsLoading, refresh: refreshRagDocs } =
    useRagDocuments()
  const readyRagDocs = ragDocs.filter((d) => d.status === 'ready')
  const currentStrategy = RAG_STRATEGIES.find((s) => s.id === ragStrategy)

  // Cập nhật trạng thái kho tài liệu khi vừa bật chế độ RAG
  const toggleRag = () => {
    const next = !ragMode
    setRagMode(next)
    if (next) {
      setAgentMode(false)
      refreshRagDocs()
    }
  }

  // ── Chế độ Agent (gọi tools) ──
  const [agentMode, setAgentMode] = useState(false)
  const toggleAgent = () => {
    const next = !agentMode
    setAgentMode(next)
    if (next) setRagMode(false)
  }

  const activeConns = connections.filter((c) => c.status === 'active')
  const activeMeta = providers.filter((p) => activeConns.some((c) => c.provider === p.id))
  const currentMeta = providers.find((p) => p.id === providerId)
  const providerNameOf = (id: string) => providers.find((p) => p.id === id)?.name ?? id

  // Mặc định chọn provider active đầu tiên
  useEffect(() => {
    if (!providerId && activeMeta.length > 0) {
      setProviderId(activeMeta[0].id)
      setModel(activeMeta[0].defaultModel)
    }
  }, [activeMeta, providerId])

  useEffect(() => {
    if (currentMeta && !currentMeta.models.includes(model)) {
      setModel(currentMeta.defaultModel)
    }
  }, [currentMeta, model])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending || !providerId) return
    // Chế độ RAG: phải có ít nhất 1 tài liệu sẵn sàng, ngược lại hiện CTA
    if (ragMode && readyRagDocs.length === 0) return
    setError(null)
    const next: ChatMessage[] = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setSending(true)
    const mode = agentMode ? 'agent' : ragMode ? 'rag' : 'chat'
    try {
      let assistant: ChatMessage
      if (agentMode) {
        const res = await sendAgentRun(providerId, next, model || undefined)
        assistant = { role: 'assistant', content: res.content, agentMeta: res }
      } else if (ragMode) {
        const res = await queryRag({
          query: content,
          strategy: ragStrategy,
          provider: providerId,
          model: model || undefined,
        })
        assistant = { role: 'assistant', content: res.answer, ragMeta: res }
      } else {
        const res = await sendAiChat(providerId, next, model || undefined)
        assistant = { role: 'assistant', content: res.content, fallback: res.fallback }
      }
      const full = [...next, assistant]
      setMessages(full)
      // Lưu vào nhật ký (chạy nền, không chặn UI)
      persistHistory(content, assistant, full.length, mode, providerId, model)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra. Hãy thử lại.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Đang tải…
      </div>
    )
  }

  if (activeMeta.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <KeyRound className="w-8 h-8 text-slate-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Chưa kết nối AI nào</h1>
        <p className="text-sm text-slate-400">
          Hãy thêm API key của gói Pro bạn đã đăng ký (Gemini, ChatGPT, Grok, Claude hoặc DeepSeek)
          để bắt đầu chat.
        </p>
        <Link
          href="/settings/ai"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-sm hover:opacity-95"
        >
          <KeyRound className="w-4 h-4" /> Kết nối AI Pro
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-brand-violet" />
          AI Chat Pro
        </h1>
        <div className="flex items-center gap-2">
          {/* Đoạn chat mới */}
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-dark-950/70 border-white/10 hover:border-white/25 text-slate-300 text-xs font-semibold transition-colors"
            title="Bắt đầu đoạn chat mới"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Chat mới</span>
          </button>
          {/* Mở nhật ký chat */}
          <button
            onClick={() => {
              setHistoryOpen(true)
              refreshSessions()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-dark-950/70 border-white/10 hover:border-white/25 text-slate-300 text-xs font-semibold transition-colors"
            title="Xem nhật ký chat đã lưu"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Lịch sử</span>
            {sessions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-violet/20 text-brand-violet text-[10px] font-bold">
                {sessions.length}
              </span>
            )}
          </button>
          {/* Toggle chế độ Agent (gọi tools) */}
          <button
            onClick={toggleAgent}
            className={`flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl border transition-colors ${
              agentMode
                ? 'bg-brand-violet/10 border-brand-violet/40'
                : 'bg-dark-950/70 border-white/10 hover:border-white/25'
            }`}
            title="Agent tự gọi tools: tìm web, đọc URL, tra giờ, tìm kho tri thức"
          >
            <span
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                agentMode ? 'bg-brand-violet' : 'bg-white/15'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  agentMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
            <Wrench
              className={`w-3.5 h-3.5 ${agentMode ? 'text-brand-violet' : 'text-slate-400'}`}
            />
            <span
              className={`text-xs font-bold ${agentMode ? 'text-brand-violet' : 'text-slate-400'}`}
            >
              Chế độ Agent
            </span>
          </button>
          {/* Toggle chế độ RAG */}
          <button
            onClick={toggleRag}
            className={`flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl border transition-colors ${
              ragMode
                ? 'bg-brand-emerald/10 border-brand-emerald/40'
                : 'bg-dark-950/70 border-white/10 hover:border-white/25'
            }`}
            title="Hỏi đáp dựa trên kho tài liệu của bạn"
          >
            <span
              className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                ragMode ? 'bg-brand-emerald' : 'bg-white/15'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                  ragMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
            <span
              className={`text-xs font-bold ${ragMode ? 'text-brand-emerald' : 'text-slate-400'}`}
            >
              Chế độ RAG
            </span>
          </button>
          <div className="relative">
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-dark-950/70 border border-white/10 text-white text-xs font-bold focus:outline-none focus:border-brand-violet/60"
            >
              {activeMeta.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          {currentMeta && (
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-dark-950/70 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-brand-violet/60"
              >
                {currentMeta.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Control RAG: chỉ hiện khi bật chế độ RAG */}
      {ragMode && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl bg-dark-950/70 border border-brand-emerald/25 px-4 py-3">
          <div className="relative">
            <select
              value={ragStrategy}
              onChange={(e) => setRagStrategy(e.target.value as RagStrategy)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-dark-900 border border-white/10 text-white text-xs font-bold focus:outline-none focus:border-brand-emerald/60"
            >
              {RAG_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-400 flex-1 min-w-[200px]">
            {currentStrategy?.description}
          </p>
          <span className="text-[11px] text-slate-500 font-mono">
            {ragDocsLoading ? '…' : `${readyRagDocs.length} tài liệu sẵn sàng`}
          </span>
        </div>
      )}

      {/* CTA khi chế độ RAG bật mà kho tri thức trống */}
      {ragMode && !ragDocsLoading && readyRagDocs.length === 0 && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <BookOpen className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-200 font-bold">Kho tri thức đang trống</p>
            <p className="text-amber-300/80 text-xs mt-0.5">
              Hãy thêm tài liệu vào{' '}
              <Link href="/knowledge" className="underline font-bold hover:text-amber-200">
                Kho tri thức
              </Link>{' '}
              để bắt đầu hỏi đáp trên dữ liệu của bạn.
            </p>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl border border-white/10 min-h-[50vh] max-h-[62vh] overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Bot className="w-10 h-10 mx-auto text-brand-violet" />
            <p className="text-sm text-slate-400">
              Chat với <span className="text-white font-bold">{currentMeta?.name}</span> bằng API key
              Pro của bạn. Key được dùng trực tiếp ở server — không qua bên thứ ba.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`group flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-tr from-brand-violet to-brand-cyan flex items-center justify-center">
                <Bot className="w-4 h-4 text-dark-950" />
              </div>
            )}
            <div className="relative max-w-[85%]">
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-brand-emerald/90 to-brand-cyan/90 text-dark-950 font-medium'
                    : 'bg-dark-950/70 border border-white/10 text-slate-200'
                }`}
              >
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <>
                    {renderMarkdown(m.content)}
                    {m.fallback && <FallbackNotice fallback={m.fallback} nameOf={providerNameOf} />}
                    {m.ragMeta && <RagMetaBlocks meta={m.ragMeta} />}
                    {m.agentMeta && <AgentMetaBlocks meta={m.agentMeta} nameOf={providerNameOf} />}
                  </>
                )}
              </div>
              {/* Xóa tin nhắn này */}
              <button
                onClick={() => handleDeleteMessage(i)}
                title="Xóa tin nhắn này"
                className={`absolute -top-2 ${
                  m.role === 'user' ? '-left-2' : '-right-2'
                } w-5 h-5 rounded-full bg-dark-950 border border-white/20 text-slate-400 hover:text-red-300 hover:border-red-400/50 items-center justify-center hidden group-hover:flex transition-colors`}
              >
                <X className="w-3 h-3" />
              </button>
              {/* Đưa sang Video Faceless */}
              {m.role === 'assistant' && (
                <button
                  onClick={() => handleMapToVideo(i, m.content)}
                  disabled={mappingIdx !== null}
                  title="Đưa sang Video Faceless: tạo dự án, nạp kịch bản + caption, mở pipeline kiểm duyệt"
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-dark-950 border border-white/20 text-slate-400 hover:text-brand-emerald hover:border-brand-emerald/50 items-center justify-center hidden group-hover:flex transition-colors disabled:opacity-50"
                >
                  {mappingIdx === i ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Clapperboard className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 shrink-0 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-tr from-brand-violet to-brand-cyan flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-dark-950 animate-spin" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-dark-950/70 border border-white/10 text-sm text-slate-400">
              {agentMode ? 'Agent đang chạy tools…' : `${currentMeta?.name} đang suy nghĩ…`}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={
            agentMode
              ? 'Hỏi agent… (tự tìm web, đọc URL, tra kho tri thức)'
              : ragMode
                ? 'Hỏi trên kho tri thức… (Enter để gửi, Shift+Enter xuống dòng)'
                : 'Nhập câu hỏi… (Enter để gửi, Shift+Enter xuống dòng)'
          }
          rows={2}
          className="flex-1 px-4 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30 resize-none"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim() || (ragMode && readyRagDocs.length === 0)}
          className="px-5 rounded-xl bg-gradient-to-r from-brand-violet to-brand-cyan text-dark-950 font-bold text-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-40"
          aria-label="Gửi"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Drawer nhật ký chat ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[88vw] bg-dark-950 border-l border-white/10 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-brand-violet" />
                Nhật ký chat
              </h2>
              <div className="flex items-center gap-1">
                {sessions.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    title="Xóa toàn bộ lịch sử chat"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-4 pt-3">
              <button
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-brand-violet to-brand-cyan text-dark-950 text-sm font-bold hover:opacity-95"
              >
                <Plus className="w-4 h-4" /> Đoạn chat mới
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loadingSession && (
                <p className="text-xs text-slate-500 text-center py-4 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang tải đoạn chat…
                </p>
              )}
              {sessions.length === 0 && !loadingSession && (
                <p className="text-xs text-slate-500 text-center py-8">
                  Chưa có lịch sử.
                  <br />
                  Mỗi đoạn chat sẽ tự động được lưu lại tại đây.
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group rounded-xl border px-3 py-2.5 transition-colors ${
                    sessionId === s.id
                      ? 'bg-brand-violet/10 border-brand-violet/40'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/25'
                  }`}
                >
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(s.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => submitRename(s.id)}
                      maxLength={120}
                      className="w-full px-2 py-1 rounded-lg bg-dark-950 border border-brand-violet/50 text-white text-sm focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => loadSession(s.id)}
                        className="flex-1 text-left min-w-0"
                        title={s.preview || s.title}
                      >
                        <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {s.providerName}
                          {s.mode !== 'chat' && ` · ${s.mode === 'agent' ? 'Agent' : 'RAG'}`} ·{' '}
                          {timeAgo(s.updatedAt)} · {s.messageCount} tin nhắn
                        </p>
                      </button>
                      <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setRenamingId(s.id)
                            setRenameValue(s.title)
                          }}
                          title="Đổi tên"
                          className="p-1 rounded text-slate-500 hover:text-white"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          title={confirmingDeleteId === s.id ? 'Bấm lần nữa để xóa' : 'Xóa đoạn chat'}
                          className={`p-1 rounded transition-colors ${
                            confirmingDeleteId === s.id
                              ? 'text-red-300 bg-red-500/20'
                              : 'text-slate-500 hover:text-red-300'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                  {confirmingDeleteId === s.id && (
                    <p className="text-[11px] text-red-300 mt-1">
                      Bấm vào thùng rác lần nữa để xác nhận xóa.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {sessions.length > 0 && (
              <div className="px-4 py-3 border-t border-white/10">
                <button
                  onClick={handleClearAll}
                  className="w-full text-xs text-slate-500 hover:text-red-300 py-1 transition-colors"
                >
                  Xóa toàn bộ lịch sử
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
