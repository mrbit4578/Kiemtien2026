'use client'

import React from 'react'
import Link from 'next/link'
import { 
  TrendingUp, 
  DollarSign, 
  Bot, 
  BrainCircuit, 
  CalendarClock, 
  ShieldCheck, 
  Sparkles, 
  ArrowUpRight, 
  Layers, 
  CheckCircle2, 
  ArrowRight,
  Eye,
  Users,
  Zap,
  Lock,
  Wifi,
  WifiOff,
  Database
} from 'lucide-react'
import { InteractiveKnowledgeGraph } from '../components/InteractiveKnowledgeGraph'
import { AutoEarningWizard } from '../components/AutoEarningWizard'
import { useSession } from '../context/SessionContext'
import { useConnections } from '../lib/hooks'

export default function HomePage() {
  const { revenue, orders, reach, accountHealth, channels, isAutoPilotRunning, apiReachable, apiAuthed, analytics } = useSession()
  const { connections } = useConnections()
  const connectedCount = connections.filter((c) => c.status === 'active').length

  const kpiCards = [
    {
      title: 'Thu Nhập Thực Tế',
      value: `${revenue.toLocaleString('vi-VN')}₫`,
      subValue: isAutoPilotRunning ? 'Đang tự động tích lũy...' : 'Sẵn sàng kích hoạt phiên 1',
      icon: DollarSign,
      color: 'from-brand-emerald to-emerald-400',
      textColor: 'text-brand-emerald',
    },
    {
      title: 'Đơn Hàng Tiếp Thị (Conversions)',
      value: `${orders} đơn`,
      subValue: orders > 0 ? 'Chốt đơn tự động' : 'Chờ chuyển đổi đầu tiên',
      icon: TrendingUp,
      color: 'from-brand-cyan to-cyan-400',
      textColor: 'text-brand-cyan',
    },
    {
      title: 'Lượt Xem Đa Kênh (Reach)',
      value: reach.toLocaleString('vi-VN'),
      subValue: 'TikTok, Reels, Shorts',
      icon: Eye,
      color: 'from-brand-violet to-violet-400',
      textColor: 'text-brand-violet',
    },
    {
      title: 'Chỉ Số Bảo Vệ Tài Khoản (ToS)',
      value: `${accountHealth} / 100`,
      subValue: '0 vi phạm, 100% AES mã hóa',
      icon: ShieldCheck,
      color: 'from-brand-indigo to-indigo-400',
      textColor: 'text-brand-indigo',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Hero Welcome Section */}
      <div className="relative overflow-hidden rounded-3xl glass-panel-glow p-8 md:p-10 border border-brand-emerald/30 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-brand-emerald/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-emerald/15 border border-brand-emerald/30 text-brand-emerald text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span>Kế Thừa Tư Duy Công Nghệ RAG & ReAct Agent WeKnora</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Nền Tảng Kiếm Tiền Online{' '}
            <span className="bg-gradient-to-r from-brand-emerald via-brand-cyan to-brand-violet bg-clip-text text-transparent">
              Minh Bạch, Tự Chủ & Bảo Mật
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            OpenRemoteHub trang bị cho bạn hệ thống trợ lý AI tự chủ, kho tri thức Wiki tự bảo trì và biểu đồ tri thức kiếm tiền (Knowledge Graph) trực quan. Quản lý việc lúc rảnh, tối ưu chuyển đổi affiliate, và không bao giờ lo spam hay bị khóa tài khoản.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/ai-copilot"
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs sm:text-sm flex items-center gap-2 hover:opacity-95 shadow-glow-emerald transition-all"
            >
              <Bot className="w-4 h-4 stroke-[2.5]" />
              <span>Khởi Chạy AI Copilot (ReAct)</span>
            </Link>

            <Link
              href="/knowledge"
              className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs sm:text-sm flex items-center gap-2 border border-white/15 transition-all"
            >
              <BrainCircuit className="w-4 h-4 text-brand-cyan" />
              <span>Khám Phá RAG & Wiki Graph</span>
            </Link>

            <Link
              href="/campaigns"
              className="px-5 py-3 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-300 hover:text-white font-medium text-xs sm:text-sm flex items-center gap-2 border border-white/5 transition-all"
            >
              <TrendingUp className="w-4 h-4 text-brand-amber" />
              <span>Chiến Dịch Hoa Hồng Cao</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <div
              key={idx}
              className="glass-panel rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">{kpi.title}</span>
                <div className={`p-2 rounded-xl bg-dark-900 border border-white/10 ${kpi.textColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white tracking-tight">{kpi.value}</h3>
                <p className="text-[11px] text-brand-emerald font-medium mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {kpi.subValue}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Số liệu thật từ backend API (GET /analytics/overview) */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-cyan" />
            Số Liệu Trực Tiếp Từ Backend
          </h3>
          <span className={`text-[11px] font-mono flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
            apiReachable && apiAuthed
              ? 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/30'
              : 'bg-dark-900 text-slate-400 border-white/10'
          }`}>
            {apiReachable && apiAuthed ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {apiReachable && apiAuthed ? 'API: đã kết nối' : apiReachable ? 'API: chưa đăng nhập' : 'API: offline (chế độ local)'}
          </span>
        </div>

        {apiReachable && apiAuthed && analytics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/5">
              <p className="text-[11px] text-slate-400">Tài khoản đang hoạt động</p>
              <p className="text-xl font-extrabold text-brand-emerald mt-1">{analytics.totalConnections}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/5">
              <p className="text-[11px] text-slate-400">Job publish thành công</p>
              <p className="text-xl font-extrabold text-brand-cyan mt-1">{analytics.totalPublished}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/5">
              <p className="text-[11px] text-slate-400">Job thất bại</p>
              <p className="text-xl font-extrabold text-brand-amber mt-1">{analytics.totalFailed}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/5">
              <p className="text-[11px] text-slate-400">Cập nhật lúc</p>
              <p className="text-xs font-bold text-slate-200 mt-1.5 font-mono">
                {new Date(analytics.lastUpdated).toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed">
            {apiReachable
              ? 'Hãy kết nối một tài khoản OAuth tại trang Kết nối & Bảo mật để xem số liệu thật.'
              : 'Backend chưa chạy hoặc chưa cấu hình NEXT_PUBLIC_API_URL — dashboard đang hiển thị dữ liệu phiên local.'}
          </p>
        )}
      </div>

      {/* Core Auto-Pilot Earning Wizard (A-Z) */}
      <AutoEarningWizard />

      {/* Central Interactive Knowledge Graph Showcase */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-brand-violet" />
              Bản Đồ Mạng Lưới Kiếm Tiền (WeKnora Knowledge Graph)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hệ thống tự động liên kết các ngách thị trường, sản phẩm và nguồn traffic tối ưu tỷ lệ hoàn vốn (ROI)
            </p>
          </div>
          <Link
            href="/knowledge"
            className="text-xs text-brand-emerald hover:text-white flex items-center gap-1 font-semibold transition-colors"
          >
            <span>Mở rộng toàn màn hình</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <InteractiveKnowledgeGraph />
      </div>

      {/* Two Columns: Revenue by Channel & Quick AI Creative Triggers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Channel Table */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-brand-emerald" />
              Doanh Thu Theo Kênh Tiếp Thị
            </h3>
            <span className="text-xs text-slate-400 font-mono">Báo cáo trực tiếp</span>
          </div>

          <div className="space-y-2.5">
            {channels.map((channel, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-dark-950/70 border border-white/5 flex items-center justify-between hover:bg-dark-900/80 transition-all"
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{channel.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{channel.orders} đơn hoàn tất</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-extrabold text-brand-emerald block">
                    {channel.revenue.toLocaleString('vi-VN')}₫
                  </span>
                  <span className="text-[10px] text-brand-cyan font-mono">{channel.growth}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Link
              href="/campaigns"
              className="w-full py-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 border border-white/10 transition-all"
            >
              <span>Xem Tất Cả Chiến Dịch Affiliate & Remote Gigs</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Security & Core Values Panel */}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-cyan" />
                Tiêu Chuẩn Minh Bạch & An Toàn Tuyệt Đối
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30 font-bold font-mono">
                ZERO SPAM
              </span>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-dark-950/60 border border-white/5 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-brand-emerald shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Không Bán Tương Tác Ảo / Không Mua Follower:</strong> Mọi doanh thu đều đến từ chuyển đổi thực chất của người dùng thực.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-dark-950/60 border border-white/5 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Mã Hóa Envelope AES-256-GCM:</strong> Khóa bí mật và OAuth tokens được bảo vệ đa lớp giống như WeKnora Enterprise.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-dark-950/60 border border-white/5 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-brand-violet shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Approval Workflow Bắt Buộc:</strong> Chỉ đăng tải khi người dùng đã duyệt thủ công, loại bỏ hoàn toàn nguy cơ tài khoản bị phạt do spam.
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-400">Trạng thái kết nối OAuth:</span>
            <Link
              href="/settings/connections"
              className="text-xs text-brand-emerald font-bold hover:underline flex items-center gap-1"
            >
              <span>{connectedCount}/5 nền tảng đã kết nối</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
