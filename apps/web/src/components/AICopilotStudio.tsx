'use client'

import React, { useState } from 'react'
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
  Clock
} from 'lucide-react'

import { useSession } from '../context/SessionContext'
import { useContent } from '../lib/hooks'
import { useRouter } from 'next/navigation'

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
  const [selectedModel, setSelectedModel] = useState('Gemini 1.5 Pro')
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

  const handleGenerate = (customPrompt?: string) => {
    const textToRun = customPrompt || prompt
    if (!textToRun.trim()) return
    setIsGenerating(true)

    // Simulate WeKnora ReAct Agent generation sequence
    setTimeout(() => {
      setSteps([
        {
          type: 'thought',
          title: 'Tư duy phân tích (Thought)',
          content: `Phân tích yêu cầu "${textToRun}": Xác định định dạng mục tiêu, tệp độc giả có khả năng chuyển đổi cao nhất, cấu trúc giá và hoa hồng affiliate.`,
        },
        {
          type: 'action',
          title: 'Thực thi công cụ (Action: Knowledge Graph & Web Search)',
          content: 'Quét cơ sở dữ liệu ngách sản phẩm, đối soát chính sách hạn chế quảng cáo của Meta/TikTok để tránh vi phạm.',
        },
        {
          type: 'observation',
          title: 'Quan sát kết quả (Observation)',
          content: 'Đã tổng hợp cấu trúc bài viết đạt điểm SEO 98/100, tích hợp sẵn thẻ kêu gọi hành động (CTA) gắn link tiếp thị.',
        },
        {
          type: 'answer',
          title: 'Nội dung tối ưu chuyển đổi (Final Answer)',
          content: `🚀 **CHIẾN LƯỢC NỘI DUNG TỐI ƯU HÓA CHUYỂN ĐỔI CHO: "${textToRun}"**

1. **Góc tiếp cận (Angle):** Đánh vào nỗi sợ bỏ lỡ cơ hội (FOMO) + Chứng thực từ case study thực tế có số liệu rõ ràng.
2. **Tiêu đề giật tít chuẩn SEO:**
   - "Top 3 Sai Lầm Khi Bắt Đầu Kiếm Tiền Online Lúc Rảnh Rỗi Khiến 90% Bỏ Cuộc"
   - "Cách Tôi Tạo Thu Nhập Thụ Động 15 Triệu/Tháng Nhờ Mô Hình Này..."
3. **Kêu gọi hành động (Safe CTA):** "Bấm vào đường dẫn trong phần mô tả để nhận tài liệu hướng dẫn từng bước miễn phí."
4. **Hashtags:** #KiemTienOnline #MMO #AffiliateMarketing #TuDoTaiChinh #OpenRemoteHub`,
        },
      ])
      setIsGenerating(false)
    }, 900)
  }

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

        {/* Model Selector */}
        <div className="flex items-center gap-2 bg-dark-900/90 border border-white/10 p-1.5 rounded-xl text-xs">
          <span className="text-slate-400 pl-2">Mô hình:</span>
          {['Gemini 1.5 Pro', 'DeepSeek V3', 'OpenAI GPT-4o'].map((model) => (
            <button
              key={model}
              onClick={() => setSelectedModel(model)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedModel === model
                  ? 'bg-brand-emerald text-dark-950 font-bold shadow-glow-emerald'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {model}
            </button>
          ))}
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
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-cyan" />
                      Tuân thủ ToS Platform
                    </span>
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
    </div>
  )
}
