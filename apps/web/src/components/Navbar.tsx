'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Bot, 
  BookOpen, 
  CalendarClock, 
  TrendingUp, 
  ShieldCheck, 
  Lock,
  Sparkles,
  DollarSign,
  KeyRound,
  LogOut,
  Map,
  Clapperboard
} from 'lucide-react'

import { useSession } from '../context/SessionContext'

export function Navbar() {
  const pathname = usePathname()
  const { revenue, isAutoPilotRunning, user, sessionLoading, logout } = useSession()

  const navItems = [
    { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
    { href: '/ai-chat', label: 'AI Chat Pro', icon: Sparkles, badge: 'Pro' },
    { href: '/knowledge', label: 'Kho tri thức', icon: BookOpen, badge: 'RAG' },
    { href: '/ai-copilot', label: 'AI Copilot (ReAct)', icon: Bot, badge: 'Agent' },
    { href: '/video-faceless', label: 'Video Faceless', icon: Clapperboard, badge: 'Mới' },
    { href: '/content', label: 'Content Studio', icon: CalendarClock },
    { href: '/campaigns', label: 'Chiến dịch Affiliate', icon: TrendingUp },
    { href: '/settings/ai', label: 'AI Pro', icon: KeyRound },
    { href: '/settings/connections', label: 'Kết nối & Bảo mật', icon: ShieldCheck },
    { href: '/huong-dan', label: 'Hướng dẫn', icon: Map },
  ]

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/10 bg-dark-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-emerald to-brand-cyan flex items-center justify-center shadow-glow-emerald transition-all group-hover:scale-105">
            <Lock className="w-5 h-5 text-dark-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                OpenRemoteHub
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-emerald/15 text-brand-emerald border border-brand-emerald/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              MMO & Remote Work Orchestration
            </p>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  isActive
                    ? 'text-white bg-white/10 shadow-sm border border-white/15'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-brand-emerald' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase tracking-wider ${
                    item.badge === 'Agent' 
                      ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30'
                      : 'bg-brand-violet/20 text-brand-violet border border-brand-violet/30'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Live Earning Quick Ticker & User */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-emerald/10 border border-brand-emerald/25 text-brand-emerald text-xs font-semibold">
            <DollarSign className="w-3.5 h-3.5 animate-pulse" />
            <span>Doanh thu: <strong className="text-white">{revenue.toLocaleString('vi-VN')}₫</strong></span>
          </div>

          <div className="flex items-center gap-2.5 pl-2 border-l border-white/10">
            {sessionLoading ? (
              <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
            ) : user ? (
              <>
                <div className="relative" title={user.name}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet flex items-center justify-center font-bold text-xs text-white border border-white/20">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-dark-950 ${isAutoPilotRunning ? 'bg-brand-cyan animate-ping' : 'bg-brand-emerald'}`}></span>
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-white max-w-[120px] truncate">{user.name}</p>
                  <button
                    onClick={logout}
                    className="text-[10px] text-slate-400 hover:text-red-300 flex items-center gap-1 font-mono"
                  >
                    <LogOut className="w-3 h-3" /> Đăng xuất
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 text-xs font-bold hover:opacity-95"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Submenu Bar */}
      <div className="lg:hidden flex items-center overflow-x-auto px-4 py-2 border-t border-white/5 gap-2 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${
                isActive
                  ? 'bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30'
                  : 'text-slate-300 bg-dark-850'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </header>
  )
}
