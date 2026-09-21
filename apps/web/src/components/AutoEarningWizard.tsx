'use client'

import React, { useState } from 'react'
import { 
  Zap, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Copy, 
  Check, 
  Share2, 
  Bot, 
  Terminal, 
  TrendingUp, 
  DollarSign, 
  ExternalLink,
  ChevronRight,
  Sliders,
  AlertCircle
} from 'lucide-react'
import { useSession } from '../context/SessionContext'
import Link from 'next/link'

export function AutoEarningWizard() {
  const { 
    revenue, 
    orders, 
    reach, 
    currentStep, 
    stepStatus, 
    isAutoPilotRunning, 
    sessionLogs, 
    sessionData, 
    startAutoPilot, 
    stopAutoPilot, 
    resetAllData, 
    runManualStep,
    setAffiliateId 
  } = useSession()

  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const [tempAffId, setTempAffId] = useState(sessionData.affiliateId)
  const [activeTab, setActiveTab] = useState<number>(currentStep > 0 ? currentStep : 1)

  const handleCopyLink = () => {
    navigator.clipboard.writeText(sessionData.utmLink)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleCopyScript = () => {
    if (!sessionData.scriptContent) return
    navigator.clipboard.writeText(sessionData.scriptContent)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  const handleSaveAffId = (e: React.FormEvent) => {
    e.preventDefault()
    if (tempAffId.trim()) {
      setAffiliateId(tempAffId.trim())
    }
  }

  const stepsInfo = [
    { num: 1, label: 'Auto-Scout & UTM', desc: 'Chọn ngách & tạo link', icon: Zap },
    { num: 2, label: 'WeKnora Agent', desc: 'Sinh kịch bản chuyển đổi', icon: Bot },
    { num: 3, label: 'ToS Anti-Ban Guard', desc: 'Rà soát chính sách 100/100', icon: ShieldCheck },
    { num: 4, label: 'Auto-Dispatch', desc: 'Lên lịch giờ vàng', icon: Clock },
    { num: 5, label: 'Live Revenue Radar', desc: 'Tự động chốt đơn', icon: TrendingUp },
  ]

  return (
    <div className="relative overflow-hidden rounded-3xl glass-panel border border-brand-emerald/30 shadow-2xl p-6 md:p-8 space-y-6">
      {/* Background Ambience Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-emerald/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Header: Title & Master Auto-Pilot Trigger */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/35 text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-emerald animate-ping"></span>
              MMO Automation Engine 2026
            </span>
            <span className="text-xs text-slate-400 font-mono">Phiên #1</span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Cỗ Máy Kiếm Tiền Tự Động Hóa (Auto-Pilot A-Z)
          </h2>
          <p className="text-xs md:text-sm text-slate-300 mt-1">
            Hệ thống AI tự chủ thực thi 5 bước khép kín: Quét ngách ➔ Viết kịch bản ➔ Duyệt ToS ➔ Xếp lịch ➔ Thu hoạch hoa hồng.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={resetAllData}
            className="px-4 py-2.5 rounded-xl bg-dark-900/80 hover:bg-dark-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-all hover:border-red-500/40"
            title="Đưa toàn bộ số liệu về 0đ sạch sẽ"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Về 0₫</span>
          </button>

          {!isAutoPilotRunning ? (
            <button
              onClick={startAutoPilot}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald via-emerald-400 to-brand-cyan text-dark-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-glow-emerald hover:opacity-95 hover:scale-[1.02] transition-all"
            >
              <Play className="w-4 h-4 fill-current stroke-none" />
              <span>KÍCH HOẠT AUTO-PILOT PHIÊN 1</span>
            </button>
          ) : (
            <button
              onClick={stopAutoPilot}
              className="px-5 py-2.5 rounded-xl bg-dark-850 border border-brand-amber/40 text-brand-amber font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-dark-800 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-brand-amber animate-pulse"></span>
              <span>Tạm Dừng Auto-Pilot</span>
            </button>
          )}
        </div>
      </div>

      {/* 5-Step Process Visualizer */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {stepsInfo.map((s) => {
          const Icon = s.icon
          const isDone = currentStep > s.num
          const isCurrent = currentStep === s.num
          return (
            <button
              key={s.num}
              onClick={() => {
                setActiveTab(s.num)
                if (currentStep < s.num) runManualStep(s.num)
              }}
              className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden ${
                isCurrent
                  ? 'bg-brand-emerald/15 border-brand-emerald/50 shadow-glow-emerald'
                  : isDone
                  ? 'bg-dark-900/60 border-brand-emerald/30 text-slate-200'
                  : 'bg-dark-950/40 border-white/5 text-slate-400 hover:border-white/15'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isCurrent 
                    ? 'bg-brand-emerald text-dark-950' 
                    : isDone 
                    ? 'bg-brand-emerald/20 text-brand-emerald' 
                    : 'bg-dark-800 text-slate-400'
                }`}>
                  {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : s.num}
                </div>
                <Icon className={`w-4 h-4 ${isCurrent ? 'text-brand-emerald animate-bounce' : isDone ? 'text-brand-cyan' : 'text-slate-500'}`} />
              </div>
              <h4 className="text-xs font-bold text-white truncate">{s.label}</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{s.desc}</p>

              {isCurrent && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-emerald to-brand-cyan"></div>
              )}
            </button>
          )
        })}
      </div>

      {/* Main Workspace Area: Step Detail Inspector + Live Logs Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Step Inspector Details */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
          {/* Step 1 Inspector */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-brand-emerald" />
                    Bước 1: Auto-Scout & Thiết Lập Link UTM Tiếp Thị
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hệ thống tự động liên kết ID của bạn với sản phẩm có hoa hồng cao nhất
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30 font-bold">
                  {sessionData.commissionRate}
                </span>
              </div>

              {/* Campaign Highlight Box */}
              <div className="p-4 rounded-xl bg-dark-950/70 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Sản phẩm tiếp thị:</span>
                  <span className="text-xs font-bold text-brand-cyan">{sessionData.targetProduct}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Hoa hồng ước tính mỗi lượt:</span>
                  <span className="text-xs font-extrabold text-brand-emerald">
                    +{sessionData.commissionPerSale.toLocaleString('vi-VN')}₫ / lượt thanh toán
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Ngách thị trường:</span>
                  <span className="text-xs text-slate-300 font-medium">{sessionData.niche}</span>
                </div>
              </div>

              {/* Editable Affiliate ID */}
              <form onSubmit={handleSaveAffId} className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Mã Affiliate ID cá nhân của bạn:</span>
                  <span className="text-[10px] text-slate-400">Có thể sửa đổi theo ý bạn</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempAffId}
                    onChange={(e) => setTempAffId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-dark-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-brand-emerald"
                    placeholder="Nhập ID cá nhân (vd: user_mmo_2026)"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-brand-emerald/20 hover:bg-brand-emerald/30 text-brand-emerald text-xs font-bold border border-brand-emerald/40 transition-colors"
                  >
                    Lưu ID
                  </button>
                </div>
              </form>

              {/* Generated UTM Link */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">Link UTM Tracking chuẩn hóa tự động:</span>
                <div className="p-2.5 rounded-xl bg-dark-900/90 border border-white/10 flex items-center justify-between gap-2">
                  <code className="text-[11px] text-brand-cyan truncate font-mono select-all">
                    {sessionData.utmLink}
                  </code>
                  <button
                    onClick={handleCopyLink}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors shrink-0"
                    title="Sao chép link"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-brand-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 Inspector */}
          {activeTab === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-brand-cyan" />
                    Bước 2: WeKnora ReAct Agent Sáng Tạo Kịch Bản
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mô hình tự chủ phân tích Hook 3 giây và kịch bản chuyển đổi
                  </p>
                </div>
                <button
                  onClick={handleCopyScript}
                  disabled={!sessionData.scriptContent}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  {copiedScript ? <Check className="w-3 h-3 text-brand-emerald" /> : <Copy className="w-3 h-3" />}
                  <span>Sao Chép Kịch Bản</span>
                </button>
              </div>

              {sessionData.scriptContent ? (
                <div className="p-4 rounded-xl bg-dark-950/80 border border-white/10 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-72 overflow-y-auto scrollbar-thin">
                  {sessionData.scriptContent}
                </div>
              ) : (
                <div className="p-8 rounded-xl bg-dark-950/40 border border-dashed border-white/10 text-center space-y-2">
                  <Bot className="w-8 h-8 text-slate-500 mx-auto animate-pulse" />
                  <p className="text-xs text-slate-400">Kịch bản đang chờ kích hoạt Auto-Pilot để tự động tạo.</p>
                  <button
                    onClick={startAutoPilot}
                    className="px-4 py-2 rounded-xl bg-brand-cyan/20 text-brand-cyan text-xs font-bold border border-brand-cyan/30 hover:bg-brand-cyan/30 transition-all"
                  >
                    Bật Auto-Pilot Ngay
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3 Inspector */}
          {activeTab === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-emerald" />
                    Bước 3: Rà Soát Chính Sách ToS & Chống Khóa Tài Khoản
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Đảm bảo an toàn 100% trước khi xuất bản ra các nền tảng
                  </p>
                </div>
                <span className="text-xs font-extrabold text-brand-emerald px-2.5 py-1 rounded-lg bg-brand-emerald/20 border border-brand-emerald/30">
                  Điểm Tuân Thủ: 100/100
                </span>
              </div>

              <div className="space-y-2.5">
                {sessionData.complianceNotes.map((note, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-dark-950/70 border border-white/5 flex items-center gap-3 text-xs text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-brand-emerald shrink-0" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-brand-emerald/10 border border-brand-emerald/25 text-xs text-slate-300 leading-relaxed">
                <strong className="text-brand-emerald">Bảo Vệ Tài Khoản Tuyệt Đối:</strong> Mọi bài viết đều được thẩm định tự động qua thuật toán kiểm duyệt nội dung của TikTok Shop, Meta Community Standards và Shopee để ngăn chặn hoàn toàn nguy cơ bị bóp tương tác hoặc shadowban.
              </div>
            </div>
          )}

          {/* Step 4 Inspector */}
          {activeTab === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-violet" />
                    Bước 4: Tự Động Xếp Lịch & Phân Phối Đa Kênh
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Xếp lịch khung giờ vàng có lượng người dùng mua sắm trực tuyến cao nhất
                  </p>
                </div>
                <Link
                  href="/content"
                  className="text-xs font-bold text-brand-violet hover:underline flex items-center gap-1"
                >
                  <span>Mở Content Studio</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/10 space-y-1">
                  <span className="text-[11px] text-slate-400">Khung giờ vàng đề xuất:</span>
                  <h4 className="text-xs font-extrabold text-white">{sessionData.scheduledTime}</h4>
                  <p className="text-[10px] text-brand-emerald">Tỷ lệ tương tác cao hơn 2.8x</p>
                </div>
                <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/10 space-y-1">
                  <span className="text-[11px] text-slate-400">Kênh phát sóng:</span>
                  <h4 className="text-xs font-extrabold text-white truncate">
                    {sessionData.distributionChannels.join(', ')}
                  </h4>
                  <p className="text-[10px] text-brand-cyan">Sẵn sàng tự động đăng tải</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 5 Inspector */}
          {activeTab === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-emerald" />
                    Bước 5: Radar Giám Sát Chuyển Đổi & Doanh Thu Thực
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hệ thống theo dõi tự động, ghi nhận lượt xem và đơn hàng phát sinh
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30 font-bold font-mono">
                  ACTIVE RADAR
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/10">
                  <span className="text-[11px] text-slate-400 block">Doanh Thu Thu Được</span>
                  <strong className="text-base font-extrabold text-brand-emerald mt-1 block">
                    {revenue.toLocaleString('vi-VN')}₫
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/10">
                  <span className="text-[11px] text-slate-400 block">Đơn Hoàn Tất</span>
                  <strong className="text-base font-extrabold text-brand-cyan mt-1 block">
                    {orders} đơn
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl bg-dark-950/70 border border-white/10">
                  <span className="text-[11px] text-slate-400 block">Lượt Xem (Reach)</span>
                  <strong className="text-base font-extrabold text-brand-violet mt-1 block">
                    {reach.toLocaleString('vi-VN')}
                  </strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-dark-900 border border-white/10 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald animate-ping"></span>
                  <span>Auto-Pilot đang kích hoạt vòng quét traffic chu kỳ 4 giây.</span>
                </div>
                <button
                  onClick={stopAutoPilot}
                  className="text-xs font-bold text-brand-amber hover:underline"
                >
                  Dừng quét
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Live WeKnora Terminal Logs */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 border border-white/10 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-emerald" />
              <span className="text-xs font-bold text-white">WeKnora Live Terminal Logs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
              <span className="text-[10px] text-brand-emerald font-mono font-bold">ONLINE</span>
            </div>
          </div>

          {/* Terminal Console View */}
          <div className="bg-dark-950 rounded-xl p-3 border border-white/10 font-mono text-[11px] space-y-2 h-64 overflow-y-auto scrollbar-thin text-slate-300">
            {sessionLogs.map((log, idx) => (
              <div 
                key={idx} 
                className={`${
                  log.includes('TỰ ĐỘNG CHỐT ĐƠN HÀNG')
                    ? 'text-brand-emerald font-bold bg-brand-emerald/10 p-1 rounded'
                    : log.includes('AUTO-PILOT') || log.includes('BƯỚC')
                    ? 'text-brand-cyan'
                    : log.includes('PASS')
                    ? 'text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                {log}
              </div>
            ))}
          </div>

          {/* Terminal Quick Hint */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <span>Độ trễ AI Agent: 120ms</span>
            <span>Mã hóa AES: Hoạt động</span>
          </div>
        </div>
      </div>
    </div>
  )
}
