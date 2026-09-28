'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  Sparkles,
  BookOpen,
  Bot,
  CalendarClock,
  TrendingUp,
  KeyRound,
  ShieldCheck,
  Map,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  Circle,
  MousePointerClick,
  type LucideIcon,
} from 'lucide-react'

type GuideNode = {
  id: string
  href: string
  label: string
  icon: LucideIcon
  color: string
  tagline: string
  lamGi: string
  steps: string[]
}

type Branch = {
  id: string
  title: string
  subtitle: string
  color: string
  nodes: GuideNode[]
}

const BRANCHES: Branch[] = [
  {
    id: 'bat-dau',
    title: '1. Bắt đầu',
    subtitle: 'Kết nối & chìa khóa — làm 1 lần duy nhất',
    color: 'text-amber-300',
    nodes: [
      {
        id: 'ket-noi',
        href: '/settings/connections',
        label: 'Kết nối & Bảo mật',
        icon: ShieldCheck,
        color: 'from-amber-500 to-orange-400',
        tagline: 'Kho khóa OAuth: nơi "cắm" tài khoản mạng xã hội vào hệ thống',
        lamGi: 'Kết nối tài khoản mạng xã hội (Instagram, Facebook, TikTok…) qua OAuth để Content Studio có thể đăng bài thay bạn. Token được mã hóa AES-256, không ai đọc được.',
        steps: [
          'Mở trang, chọn mạng xã hội cần kết nối, bấm "Kết nối".',
          'Đăng nhập và bấm "Cho phép" trên trang của mạng xã hội đó.',
          'Thấy trạng thái "Đã kết nối" là xong — quay lại làm việc.',
        ],
      },
      {
        id: 'ai-pro',
        href: '/settings/ai',
        label: 'AI Pro',
        icon: KeyRound,
        color: 'from-yellow-500 to-amber-400',
        tagline: 'Chìa khóa AI: nạp API key để dùng AI Chat, Copilot, RAG',
        lamGi: 'Thêm API key của nhà cung cấp AI (Google Gemini, OpenAI…) để mở khóa toàn bộ tính năng AI trong hệ thống.',
        steps: [
          'Mở trang AI Pro, chọn nhà cung cấp AI.',
          'Dán API key lấy từ trang của nhà cung cấp đó.',
          'Bấm Lưu — AI Chat và Copilot dùng được ngay.',
        ],
      },
    ],
  },
  {
    id: 'tri-thuc',
    title: '2. Tri thức & AI',
    subtitle: 'Nạp kiến thức riêng → trò chuyện & nhờ AI làm việc',
    color: 'text-cyan-300',
    nodes: [
      {
        id: 'kho-tri-thuc',
        href: '/knowledge',
        label: 'Kho tri thức',
        icon: BookOpen,
        color: 'from-cyan-500 to-sky-400',
        tagline: 'Thư viện kiến thức riêng của bạn — AI đọc để trả lời đúng ngữ cảnh',
        lamGi: 'Tải tài liệu (PDF, Word…), dán URL hoặc văn bản vào kho. Hệ thống tự chia nhỏ, tạo embedding để AI tìm và trích dẫn đúng kiến thức của bạn khi trò chuyện.',
        steps: [
          'Bấm "Thêm tài liệu", chọn File / URL / Văn bản.',
          'Đợi trạng thái "Hoàn tất" (hệ thống đang xử lý).',
          'Từ giờ AI Chat và Copilot có thể trả lời dựa trên tài liệu này.',
        ],
      },
      {
        id: 'ai-chat',
        href: '/ai-chat',
        label: 'AI Chat Pro',
        icon: Sparkles,
        color: 'from-violet-500 to-purple-400',
        tagline: 'Trò chuyện với AI có nhớ ngữ cảnh & kiến thức của bạn',
        lamGi: 'Hỏi đáp, lên ý tưởng, viết nháp nội dung. AI tự tra Kho tri thức khi cần nên câu trả lời bám sát tài liệu của bạn.',
        steps: [
          'Gõ câu hỏi vào ô chat, Enter để gửi.',
          'Muốn AI dùng tài liệu riêng: hỏi đúng chủ đề đã nạp vào Kho tri thức.',
          'Ý tưởng hay → bấm "Đưa vào Content Studio" để thành bản nháp.',
        ],
      },
      {
        id: 'ai-copilot',
        href: '/ai-copilot',
        label: 'AI Copilot (ReAct)',
        icon: Bot,
        color: 'from-fuchsia-500 to-pink-400',
        tagline: 'Chế độ Agent: AI tự suy nghĩ → dùng công cụ → làm việc nhiều bước',
        lamGi: 'Bật "Chế độ Agent" để AI tự tìm kiếm web, đọc tài liệu, tra cứu rồi mới trả lời — phù hợp việc phức tạp nhiều bước.',
        steps: [
          'Bật công tắc "Chế độ Agent" trên trang chat.',
          'Giao việc nhiều bước, ví dụ: "Tìm 5 ý tưởng video về… rồi viết kịch bản".',
          'Theo dõi từng bước AI làm bên dưới câu trả lời.',
        ],
      },
    ],
  },
  {
    id: 'san-xuat',
    title: '3. Sản xuất & Phân phối',
    subtitle: 'Biến ý tưởng thành bài đăng tự động mỗi ngày',
    color: 'text-emerald-300',
    nodes: [
      {
        id: 'content',
        href: '/content',
        label: 'Content Studio',
        icon: CalendarClock,
        color: 'from-emerald-500 to-teal-400',
        tagline: 'Xưởng nội dung: nháp → duyệt → lên lịch → đăng tự động',
        lamGi: 'Quản lý vòng đời bài viết: tạo nháp (tay hoặc từ AI), gắn ảnh/video, duyệt, đẩy vào queue — worker tự đăng lên mạng xã hội đúng giờ.',
        steps: [
          'Bấm "Tạo Bài Viết Mới" hoặc nhận nháp từ AI Chat/Copilot.',
          'Bấm "Tải ảnh lên" để gắn ảnh (nhiều ảnh = đăng carousel Instagram).',
          'Bấm "Đẩy Lên Queue Publish" — bài tự đăng, xem kết quả ở tab "Đã xuất bản".',
        ],
      },
      {
        id: 'campaigns',
        href: '/campaigns',
        label: 'Chiến dịch Affiliate',
        icon: TrendingUp,
        color: 'from-lime-500 to-green-400',
        tagline: 'Quản lý chiến dịch tiếp thị liên kết & link sản phẩm',
        lamGi: 'Tạo và theo dõi các chiến dịch affiliate: gắn link sản phẩm vào nội dung, đo đơn hàng và hoa hồng.',
        steps: [
          'Tạo chiến dịch mới, điền tên và link affiliate.',
          'Gắn chiến dịch vào bài viết trong Content Studio.',
          'Theo dõi đơn hàng ở trang Tổng quan.',
        ],
      },
    ],
  },
  {
    id: 'theo-doi',
    title: '4. Theo dõi',
    subtitle: 'Nhìn một mắt là biết hệ thống đang chạy thế nào',
    color: 'text-sky-300',
    nodes: [
      {
        id: 'tong-quan',
        href: '/',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        color: 'from-sky-500 to-blue-400',
        tagline: 'Bảng điều khiển: thu nhập, đơn hàng, lượt xem, sức khỏe tài khoản',
        lamGi: 'Trang chủ sau khi đăng nhập: KPI thu nhập/đơn/reach, trạng thái kết nối, nút kích hoạt Auto-Pilot và nhật ký hoạt động trực tiếp.',
        steps: [
          'Mở mỗi sáng để xem số liệu hôm qua.',
          'KPI đỏ → bấm vào để sang trang chi tiết xử lý.',
          'Muốn tự động hóa: bấm "Kích hoạt Auto-Pilot".',
        ],
      },
    ],
  },
]

const QUICK_START = [
  { label: 'Kết nối mạng xã hội', href: '/settings/connections', desc: 'Cắm Instagram/Facebook vào hệ thống' },
  { label: 'Nạp API key AI', href: '/settings/ai', desc: 'Mở khóa AI Chat & Copilot' },
  { label: 'Nạp tài liệu vào Kho tri thức', href: '/knowledge', desc: 'Để AI hiểu kiến thức của bạn' },
  { label: 'Chat thử với AI', href: '/ai-chat', desc: 'Hỏi 1 câu về tài liệu vừa nạp' },
  { label: 'Tạo bài & tải ảnh lên', href: '/content', desc: 'Tạo nháp, gắn 1–3 ảnh' },
  { label: 'Đẩy lên queue publish', href: '/content', desc: 'Bấm nút xanh, chờ tab "Đã xuất bản"' },
]

function NodeCard({ node, open, onToggle }: { node: GuideNode; open: boolean; onToggle: () => void }) {
  const Icon = node.icon
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.04] transition-colors"
      >
        <span className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${node.color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-white text-[15px]">{node.label}</span>
          <span className="block text-[12.5px] text-slate-400 truncate">{node.tagline}</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5">
          <p className="text-[13.5px] text-slate-300 leading-relaxed mt-3">{node.lamGi}</p>
          <div className="mt-3 space-y-2">
            {node.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[13px] text-slate-300">
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{s}</span>
              </div>
            ))}
          </div>
          <Link
            href={node.href}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-300 hover:text-emerald-200"
          >
            <MousePointerClick className="w-4 h-4" />
            Mở trang {node.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default function HuongDanPage() {
  const [openId, setOpenId] = useState<string | null>('ket-noi')
  const [done, setDone] = useState<boolean[]>(Array(QUICK_START.length).fill(false))

  const toggleDone = (i: number) => {
    setDone((d) => {
      const n = [...d]
      n[i] = !n[i]
      return n
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[12.5px] font-semibold">
          <Map className="w-4 h-4" />
          Sơ đồ tư duy toàn hệ thống
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">
          Bản đồ OpenRemoteHub
        </h1>
        <p className="text-slate-400 text-[14.5px] max-w-2xl mx-auto leading-relaxed">
          Người mới chỉ cần đi theo <strong className="text-white">Lộ trình 15 phút</strong> bên dưới là thao tác được ngay.
          Muốn hiểu sâu từng phần, bấm vào từng nhánh của sơ đồ cây.
        </p>
      </div>

      {/* Quick start path */}
      <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-5 md:p-7">
        <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          Lộ trình 15 phút cho người mới
        </h2>
        <p className="text-[13px] text-slate-400 mt-1 mb-5">
          Làm lần lượt 6 bước — bấm vào từng bước để tích chọn khi xong.
        </p>
        <div className="space-y-2.5">
          {QUICK_START.map((s, i) => {
            const isDone = done[i]
            return (
              <div key={i} className="flex items-center gap-3">
                <button
                  onClick={() => toggleDone(i)}
                  aria-label={isDone ? 'Bỏ đánh dấu' : 'Đánh dấu hoàn thành'}
                  className="shrink-0"
                >
                  {isDone ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-600 hover:text-slate-400" />
                  )}
                </button>
                <Link
                  href={s.href}
                  className={`flex-1 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    isDone
                      ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <span>
                    <span className={`block text-[14px] font-bold ${isDone ? 'text-slate-500 line-through' : 'text-white'}`}>
                      <span className="text-emerald-300 mr-1.5">{i + 1}.</span>
                      {s.label}
                    </span>
                    <span className="block text-[12.5px] text-slate-500">{s.desc}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                </Link>
              </div>
            )
          })}
        </div>
        {done.every(Boolean) && (
          <p className="mt-4 text-center text-emerald-300 font-bold text-[14px]">
            Xong! Bạn đã nắm toàn bộ luồng vận hành cơ bản.
          </p>
        )}
      </section>

      {/* Tree / mindmap */}
      <section className="space-y-8">
        <h2 className="text-lg font-extrabold text-white text-center">
          Sơ đồ cây toàn hệ thống
        </h2>
        {BRANCHES.map((branch) => (
          <div key={branch.id}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-[15px] font-extrabold ${branch.color}`}>{branch.title}</span>
              <span className="text-[12.5px] text-slate-500">{branch.subtitle}</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {branch.nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  open={openId === node.id}
                  onToggle={() => setOpenId((cur) => (cur === node.id ? null : node.id))}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Footer note */}
      <p className="text-center text-[12.5px] text-slate-600 pb-6">
        Mẹo: luôn bắt đầu từ nhánh <strong className="text-slate-400">1. Bắt đầu</strong> khi dùng lần đầu —
        kết nối xong một lần, các lần sau chỉ việc sản xuất nội dung ở nhánh 3.
      </p>
    </div>
  )
}
