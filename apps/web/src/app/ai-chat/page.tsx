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
} from 'lucide-react'
import {
  useAiProviders,
  useAiConnections,
  sendAiChat,
  sendAgentRun,
  useRagDocuments,
  queryRag,
} from '../../lib/hooks'
import { ApiError } from '../../lib/api'
import type { ChatMessage, RagQueryResult, RagStrategy, AgentRunResponse } from '../../lib/types'

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

/** Khối "Quá trình agent" dưới câu trả lời ở chế độ Agent: các tool đã gọi. */
function AgentMetaBlocks({ meta }: { meta: AgentRunResponse }) {
  return (
    <div className="mt-3 space-y-3">
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
  const bottomRef = useRef<HTMLDivElement>(null)

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
    try {
      if (agentMode) {
        const res = await sendAgentRun(providerId, next, model || undefined)
        setMessages([...next, { role: 'assistant', content: res.content, agentMeta: res }])
      } else if (ragMode) {
        const res = await queryRag({
          query: content,
          strategy: ragStrategy,
          provider: providerId,
          model: model || undefined,
        })
        setMessages([...next, { role: 'assistant', content: res.answer, ragMeta: res }])
      } else {
        const res = await sendAiChat(providerId, next, model || undefined)
        setMessages([...next, { role: 'assistant', content: res.content }])
      }
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
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-tr from-brand-violet to-brand-cyan flex items-center justify-center">
                <Bot className="w-4 h-4 text-dark-950" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                  {m.ragMeta && <RagMetaBlocks meta={m.ragMeta} />}
                  {m.agentMeta && <AgentMetaBlocks meta={m.agentMeta} />}
                </>
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
    </div>
  )
}
