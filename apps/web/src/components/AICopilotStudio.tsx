'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Sparkles,
  Send,
  Copy,
  Check,
  CheckCircle2,
  ChevronRight,
  Play,
  BrainCircuit,
  ShieldCheck,
  CalendarPlus,
  RefreshCw,
  Clock,
  ImagePlus
} from 'lucide-react'

import { useSession } from '../context/SessionContext'
import { useContent, useAiConnections, useAiProviders, sendAgentRun } from '../lib/hooks'
import { ApiError } from '../lib/api'
import { AiModelSelector } from './AiModelSelector'
import { useRouter } from 'next/navigation'
import { CanvaAutofillModal } from './CanvaAutofillModal'

interface ReActStep {
  type: 'thought' | 'action' | 'observation' | 'answer'
  title: string
  content: string
}

export function AICopilotStudio() {
  const { sessionData, setCampaign, runManualStep } = useSession()
  const { create } = useContent()
  const router = useRouter()
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [canvaAnswer, setCanvaAnswer] = useState<string | null>(null)

  /** Đưa kết quả ReAct vào Content Studio: tạo bản nháp KHÔNG lên lịch
   *  (scheduledAt = undefined) để có thể phê duyệt + push ngay tại trang /content. */
  const handlePushToContentStudio = async (answerContent: string) => {
    if (pushing) return
    setPushing(true)
    setPushError(null)
    try {
      await create({ caption: answerContent.trim() })
      router.push('/content')
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Đưa vào Content Studio thất bại.')
    } finally {
      setPushing(false)
    }
  }
  const [prompt, setPrompt] = useState('')
  const [agentError, setAgentError] = useState<string | null>(null)

  // ── Provider/model thật — cùng cấu trúc với AI Chat Pro ──
  const { providers } = useAiProviders()
  const { connections } = useAiConnections()
  const [providerId, setProviderId] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const activeConns = connections.filter((c) => c.status === 'active')
  const activeMeta = providers.filter((p) => activeConns.some((c) => c.provider === p.id))
  const currentMeta = providers.find((p) => p.id === providerId)

  // Đổi provider → reset model về default nếu model hiện tại không thuộc provider mới
  useEffect(() => {
    if (currentMeta && model && !currentMeta.models.includes(model)) {
      setModel(currentMeta.defaultModel)
    }
  }, [currentMeta, model])

  /**
   * Chạy agent THẬT qua POST /ai/agent/run (think→act→observe),
   * dựng trace timeline từ tool calls thật + final answer.
   */
  const runAgent = async (text: string, pid?: string, mdl?: string) => {
    const textToRun = text.trim()
    if (!textToRun || isGenerating) return
    const useProvider = pid || providerId
    if (!useProvider) {
      setAgentError('Chưa kết nối AI provider nào. Hãy vào Cài đặt → AI Pro để kết nối key.')
      return
    }
    setIsGenerating(true)
    setAgentError(null)
    try {
      const res = await sendAgentRun(
        useProvider,
        [{ role: 'user' as const, content: textToRun }],
        mdl || model || undefined,
        { maxTurns: 10 },
      )
      const trace: ReActStep[] = [
        {
          type: 'thought',
          title: 'Tư duy phân tích (Thought)',
          content: `Agent hoàn thành ${res.turns} vòng suy luận (Thought → Action → Observation) với model ${res.model}.`,
        },
      ]
      res.toolCalls.forEach((tc, i) => {
        trace.push({
          type: 'action',
          title: `Thực thi công cụ #${i + 1} (Action: ${tc.name})`,
          content: tc.output.slice(0, 1500),
        })
      })
      trace.push({
        type: 'answer',
        title: 'Kịch bản hoàn chỉnh (Final Answer)',
        content: res.content,
      })
      setSteps(trace)
    } catch (err) {
      setAgentError(err instanceof ApiError ? err.message : 'Chạy agent thất bại. Hãy thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerate = (customPrompt?: string) => {
    void runAgent(customPrompt || prompt)
  }

  // Nhận tác vụ từ trang khác (ví dụ: nút ở sơ đồ ngách) qua query params:
  // ?prompt=...&autorun=1&provider=...&model=... → nạp prompt, chọn AI, TỰ CHẠY luôn.
  const autoRanRef = useRef(false)
  useEffect(() => {
    const metas = providers.filter((p) =>
      connections.some((c) => c.provider === p.id && c.status === 'active'),
    )
    if (metas.length === 0 || autoRanRef.current) return
    autoRanRef.current = true
    try {
      const qs = new URLSearchParams(window.location.search)
      const meta = metas.find((m) => m.id === qs.get('provider')) ?? metas[0]
      const mdl = qs.get('model') && meta.models.includes(qs.get('model') as string)
        ? (qs.get('model') as string)
        : meta.defaultModel
      setProviderId(meta.id)
      setModel(mdl)
      const q = qs.get('prompt')
      if (q && q.trim()) {
        setPrompt(q)
        if (qs.get('autorun') === '1') {
          void runAgent(q, meta.id, mdl)
        }
      }
    } catch {
      // bỏ qua nếu không đọc được query string
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, connections])
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [steps, setSteps] = useState<ReActStep[]>([
    {
      type: 'thought',
      title: 'Tư duy phân tích (Thought)',
      content: 'Nhận diện yêu cầu: Tạo kịch bản ngắn TikTok & Reels cho sản phẩm công nghệ (Mic thu âm không dây). Cần giữ chân người xem trong 3 giây đầu (Hook), kích thích tò mò về chất lượng âm thanh và thúc đẩy bấm vào giỏ hàng vàng.',
    },
    {
      type: 'action',
      title: 'Thực thi công cụ (Action: RAG Retrieval)',
      content: 'Gọi RAG tìm kiếm công thức kịch bản "Before - After Sound Test" kết hợp chính sách TikTok Shop Affiliate 2026.',
    },
    {
      type: 'observation',
      title: 'Quan sát kết quả (Observation)',
      content: 'Phát hiện: Video dạng so sánh âm thanh quán cafe ồn ào và bật lọc tiếng ồn có tỷ lệ retention cao hơn 3.2 lần. ToS yêu cầu gắn nhãn "Được tài trợ / Tiếp thị liên kết" để không bị bóp reach.',
    },
    {
      type: 'answer',
      title: 'Kịch bản hoàn chỉnh (Final Answer)',
      content: `🎬 **KỊCH BẢN VIDEO NGẮN: THỬ THÁCH ÂM THANH QUÁN CÀ PHÊ (60S)**

⏱️ **00:00 - 00:03 (HOOK CỰC MẠNH)**
- **Hình ảnh:** Đứng giữa ngã tư hoặc quán cà phê đông đúc, tiếng xe cộ ầm ĩ.
- **Lời thoại:** "Nếu bạn vẫn dùng mic điện thoại để quay video, hãy dừng lại ngay trước khi quá muộn!"

⏱️ **00:03 - 00:15 (VẤN ĐỀ & TRẢI NGHIỆM THỰC TẾ)**
- **Hình ảnh:** Nói chuyện không dùng mic ngoài - tiếng ồn lấn át, tiếng quạt gió rít.
- **Lời thoại:** "Đây là âm thanh gốc từ điện thoại: tiếng còi xe, tiếng người xung quanh át hết giọng mình..."

⏱️ **00:15 - 00:35 (GIẢI PHÁP & SO SÁNH "WOW")**
- **Hình ảnh:** Bấm nút trên Mic thu âm không dây K9 Pro -> tiếng ồn nền tắt lịm tức thì.
- **Lời thoại:** "Và đây là khi bật chống ồn chủ động bằng chip AI thế hệ mới! Âm thanh trong trẻo, giọng nói trầm ấm như phòng thu chuyên nghiệp."

⏱️ **00:35 - 00:50 (TÍNH NĂNG ĐÁNG TIỀN)**
- **Hình ảnh:** Cắm trực tiếp đầu thu Type-C/Lightning không cần cài app; pin dùng 8 tiếng liên tục; khoảng cách bắt sóng 20m.
- **Lời thoại:** "Nhỏ gọn bằng ngón tay, cắm là nhận, quay cả ngày không lo hết pin."

⏱️ **00:50 - 01:00 (CALL TO ACTION & AFFILIATE)**
- **Hình ảnh:** Chỉ tay xuống góc trái màn hình (vị trí nút giỏ hàng TikTok).
- **Lời thoại:** "Mã giảm giá 30% kèm quà tặng đang có sẵn ở giỏ hàng vàng bên dưới. Bấm ngay kẻo hết slot nhé!"

📌 **CAPTION GỢI Ý:**
Bí quyết âm thanh triệu view dù quay ngoài đường ồn ào! 🎙️✨ Đừng để âm thanh tệ giết chết video của bạn. Link ưu đãi ở giỏ hàng nhé cả nhà! 
#MicThuAm #ReviewCongNghe #KienThucQuayPhim #GocSangTao #ShopeeAffiliate #TikTokShop

🛡️ **Kiểm tra tuân thủ:** 100% tuân thủ chính sách ToS (Đã chèn hashtag minh bạch và không vi phạm quy chuẩn âm thanh).`,
    },
  ])

  const handleCopy = () => {
    const lastStep = steps.find((s) => s.type === 'answer')
    if (lastStep) {
      navigator.clipboard.writeText(lastStep.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-br from-brand-cyan to-brand-indigo text-dark-950 shadow-glow-cyan">
              <Bot className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-white">AI Copilot Kiếm Tiền (ReAct Autonomous Agent)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kế thừa bộ não ReAct của WeKnora: Chu trình Thought ➔ Action ➔ Observation ➔ Final Answer
              </p>
            </div>
          </div>
        </div>

        {/* Model Selector — provider/key + model thật, cùng cấu trúc AI Chat Pro */}
        <div className="flex items-center gap-2 bg-dark-900/90 border border-white/10 p-1.5 rounded-xl text-xs">
          <span className="text-slate-400 pl-2 shrink-0">Mô hình:</span>
          <AiModelSelector
            providerId={providerId}
            onProviderChange={setProviderId}
            model={model}
            onModelChange={setModel}
            activeMeta={activeMeta}
            currentMeta={currentMeta}
          />
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 flex items-center gap-1 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-brand-emerald" /> Gợi ý nhanh:
        </span>
        {[
          '🔥 [Phiên #1] Kịch bản TikTok 60s bán Notion AI & Workflow Kit',
          'Kịch bản TikTok Review Mic Thu Âm chuyển đổi cao',
          'Viết bài so sánh Top 3 thẻ tín dụng hoàn tiền hoa hồng 800k',
          'Kịch bản Reels 30s bán template Notion tự động hóa',
          'Kiểm tra ToS bài đăng affiliate tránh bị bóp reach',
        ].map((item, idx) => (
          <button
            key={idx}
            onClick={() => {
              setPrompt(item)
              handleGenerate(item)
            }}
            className="whitespace-nowrap px-3 py-1.5 rounded-full bg-dark-850 hover:bg-dark-800 text-slate-300 hover:text-white border border-white/5 transition-all"
          >
            {item}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="glass-panel rounded-2xl p-4 border border-white/10 relative">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Nhập yêu cầu sáng tạo nội dung, kịch bản video, hoặc chiến lược affiliate của bạn (Ví dụ: Tạo kịch bản TikTok 60s review nồi chiên không dầu gắn giỏ hàng Shopee)..."
          className="w-full bg-dark-950/70 text-white rounded-xl p-3.5 text-sm border border-white/10 focus:border-brand-emerald focus:outline-none focus:ring-1 focus:ring-brand-emerald placeholder:text-slate-500"
        />
        {agentError && (
          <p className="mt-2 text-xs text-red-300">⚠ {agentError}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
            Sandbox bảo mật: Không rò rỉ API key & an toàn ToS
          </div>
          <button
            onClick={() => handleGenerate()}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center gap-2 hover:opacity-95 shadow-glow-emerald disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>AI Đang Suy Luận...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Chạy Tác Nhân ReAct</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Output ReAct Trace */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-brand-emerald" />
            Nhật Ký Suy Luận ReAct (Trace Timeline)
          </h3>
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 hover:text-white border border-white/10 flex items-center gap-1.5 transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-brand-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Đã sao chép' : 'Sao chép kết quả'}</span>
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isAnswer = step.type === 'answer'
            const badgeColor =
              step.type === 'thought'
                ? 'bg-brand-indigo/20 text-brand-indigo border-brand-indigo/30'
                : step.type === 'action'
                ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/30'
                : step.type === 'observation'
                ? 'bg-brand-amber/20 text-brand-amber border-brand-amber/30'
                : 'bg-brand-emerald/20 text-brand-emerald border-brand-emerald/30'

            return (
              <div
                key={idx}
                className={`rounded-xl p-4 border transition-all ${
                  isAnswer
                    ? 'glass-panel-glow bg-dark-900/90 border-brand-emerald/40 shadow-glow-emerald'
                    : 'glass-panel bg-dark-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}>
                    {step.type}
                  </span>
                  <span className="text-xs font-bold text-white">{step.title}</span>
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans pl-1">
                  {step.content}
                </div>

                {isAnswer && (
                  <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setCampaign({ scriptContent: step.content })
                        runManualStep(3)
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-brand-emerald text-dark-950 text-xs font-bold flex items-center gap-1.5 shadow-glow-emerald hover:opacity-90 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Nạp Vào Kịch Bản Phiên #1</span>
                    </button>
                    <button
                      onClick={() => handlePushToContentStudio(step.content)}
                      disabled={pushing}
                      title="Tạo bản nháp trong Content Studio — không lên lịch, có thể phê duyệt và push ngay"
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10 transition-all disabled:opacity-50"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-brand-emerald" />
                      <span>{pushing ? 'Đang đưa vào...' : 'Đưa vào Content Studio'}</span>
                    </button>
                    <button
                      onClick={() => setCanvaAnswer(step.content)}
                      title="Điền kịch bản vào mẫu Canva (autofill) rồi tự tạo nháp Content Studio"
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10 transition-all"
                    >
                      <ImagePlus className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Gửi sang Canva</span>
                    </button>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-cyan" />
                      Tuân thủ ToS Platform
                    </span>
                    {step.content.length > 2200 && (
                      <p className="w-full text-[11px] text-amber-300">
                        ⚠ Kịch bản dài {step.content.length} ký tự — vượt giới hạn 2200 ký tự của
                        Instagram. Vẫn lưu nháp được; hãy rút gọn trước khi đăng IG
                        (TikTok/Facebook cho phép dài hơn).
                      </p>
                    )}
                    {pushError && (
                      <p className="w-full text-[11px] text-red-300">{pushError}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canvaAnswer && (
        <CanvaAutofillModal answer={canvaAnswer} onClose={() => setCanvaAnswer(null)} />
      )}
    </div>
  )
}
