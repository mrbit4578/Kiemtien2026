import { Shield, GitFork, Heart, Sparkles, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-dark-950/90 text-slate-400 py-10 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-bold text-white text-base">OpenRemoteHub</span>
              <span className="text-[10px] bg-brand-emerald/20 text-brand-emerald px-1.5 py-0.5 rounded font-mono">
                AGPLv3 · Open Source
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Nền tảng kiếm tiền online minh bạch và an toàn. Tích hợp nối tư duy RAG tốc độ cao, tác nhân AI tự chủ (ReAct Agent) và Biểu đồ tri thức trực quan kế thừa từ dự án WeKnora.
            </p>
            <div className="flex items-center gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1.5 text-brand-emerald">
                <Shield className="w-3.5 h-3.5" /> Không bán tương tác ảo
              </span>
              <span className="flex items-center gap-1.5 text-brand-cyan">
                <Shield className="w-3.5 h-3.5" /> Mã hóa AES-256-GCM
              </span>
              <span className="flex items-center gap-1.5 text-brand-violet">
                <Shield className="w-3.5 h-3.5" /> Chống spam tự động
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-3">Công Nghệ Cốt Lõi</h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/knowledge" className="hover:text-white transition-colors">WeKnora RAG Multi-Stage</Link></li>
              <li><Link href="/ai-copilot" className="hover:text-white transition-colors">ReAct Autonomous Agent</Link></li>
              <li><Link href="/knowledge" className="hover:text-white transition-colors">Interactive Knowledge Graph</Link></li>
              <li><Link href="/settings/connections" className="hover:text-white transition-colors">OAuth Security Vault</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-wider mb-3">Tuyên Bố Miễn Trừ</h4>
            <p className="text-xs text-slate-400 leading-normal">
              Dự án cung cấp công cụ tự động hóa thông minh. Người dùng tự chịu trách nhiệm về nội dung, quyền sử dụng media, khai báo thuế và tuân thủ điều khoản dịch vụ (ToS) của từng mạng xã hội.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>© {new Date().getFullYear()} OpenRemoteHub — Đồng hành cùng Freelancers & Creators Việt Nam & Quốc tế.</p>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Kiến trúc kế thừa WeKnora Framework</span>
            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
            <span className="text-brand-emerald font-mono">v1.0.0-PRO</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
