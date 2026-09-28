'use client'

import React, { useState } from 'react'
import { 
  TrendingUp, 
  ExternalLink, 
  Copy, 
  Check, 
  DollarSign, 
  Sparkles, 
  ArrowUpRight, 
  Filter,
  Layers,
  Award
} from 'lucide-react'
import { useSession } from '../context/SessionContext'
import SafeLink from './SafeLink'

export interface Campaign {
  id: string
  title: string
  network: string
  category: string
  commission: string
  epc: string // Earnings per click
  conversionRate: string
  affiliateUrl: string
  description: string
  hot: boolean
}

const CAMPAIGNS: Campaign[] = [
  {
    id: 'camp_1',
    title: 'Mở Tài Khoản Số & Thẻ Tín Dụng VPBank Neo',
    network: 'AccessTrade VN',
    category: 'Tài chính & Ngân hàng',
    commission: '850.000₫ / thẻ duyệt',
    epc: '14.500₫',
    conversionRate: '8.4%',
    affiliateUrl: 'https://accesstrade.vn/c/vpbank?aff_id=orh_102&utm_source=openremotehub',
    description: 'Chiến dịch D2C tài chính trả thưởng cao nhất tháng. Miễn phí thường niên trọn đời, khách hàng chỉ cần CCCD gắn chip xác thực qua app trong 5 phút.',
    hot: true,
  },
  {
    id: 'camp_2',
    title: 'Gói Bản Quyền & Template Notion AI Workflow 2026',
    network: 'Gumroad / Direct Creator',
    category: 'Sản phẩm số & AI',
    commission: '45% (405.000₫ / đơn)',
    epc: '22.000₫',
    conversionRate: '12.1%',
    affiliateUrl: 'https://creator.openremotehub.com/notion-ai?ref=orh_vip',
    description: 'Bộ công cụ số tối ưu hóa công việc remote cho freelancer. Khách hàng thanh toán qua cổng quốc tế và nhận link tải template tức thì.',
    hot: true,
  },
  {
    id: 'camp_3',
    title: 'Shopee Affiliate: Thiết Bị Setup Bàn Làm Việc Thông Minh',
    network: 'Shopee Affiliate',
    category: 'Công nghệ & Đời sống',
    commission: '12% - 15% / đơn',
    epc: '4.800₫',
    conversionRate: '15.6%',
    affiliateUrl: 'https://shope.ee/setup-smart?utm_source=openremotehub',
    description: 'Sản phẩm bán chạy: Đèn kẹp màn hình chống cận, giá đỡ công thái học, bàn phím cơ không dây. Tỷ lệ chốt đơn rất cao trên video ngắn.',
    hot: false,
  },
  {
    id: 'camp_4',
    title: 'TikTok Shop: Combo Mic Thu Âm Wireless K9 Pro',
    network: 'TikTok Shop Partner',
    category: 'Âm thanh & Quay dựng',
    commission: '18% (72.000₫ / đơn)',
    epc: '8.900₫',
    conversionRate: '11.8%',
    affiliateUrl: 'https://vt.tiktok.com/t/orh_k9pro',
    description: 'Hot trend dành cho nhà sáng tạo nội dung quay video ngoài trời. Tặng kèm bông lọc gió và đầu chuyển đổi cho iPhone và Android.',
    hot: true,
  },
  {
    id: 'camp_5',
    title: 'Amazon Associates: Phụ Kiện Du Lịch & Remote Work Nomads',
    network: 'Amazon Associates US',
    category: 'Quốc tế (USD)',
    commission: '8% ($4.50 - $18.00 / item)',
    epc: '$0.85',
    conversionRate: '9.2%',
    affiliateUrl: 'https://amzn.to/3orh_nomad?tag=orh-20',
    description: 'Chiến dịch kiếm ngoại tệ USD từ lưu lượng truy cập quốc tế. Cookie lưu 24h, nhận hoa hồng trên toàn bộ giỏ hàng khách thanh toán.',
    hot: false,
  },
]

export function CampaignsDirectory() {
  const { setCampaign, runManualStep } = useSession()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = CAMPAIGNS.filter((c) => {
    if (selectedCategory === 'all') return true
    return c.category.includes(selectedCategory)
  })

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-br from-brand-emerald to-brand-cyan text-dark-950 shadow-glow-emerald">
              <TrendingUp className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-white">Danh Mục Chiến Dịch Kiếm Tiền (Affiliate Hub)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Các chiến dịch đã được kiểm duyệt chất lượng, hoa hồng minh bạch, hỗ trợ tracking link tự động
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'Tài chính', label: 'Tài chính (Hoa hồng cao)' },
            { id: 'Sản phẩm số', label: 'Sản phẩm số & AI' },
            { id: 'Công nghệ', label: 'Công nghệ Shopee/TikTok' },
            { id: 'Quốc tế', label: 'Ngoại tệ USD' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedCategory === cat.id
                  ? 'bg-brand-emerald text-dark-950 font-bold shadow-glow-emerald'
                  : 'bg-dark-850 text-slate-300 hover:text-white border border-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Campaign Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((campaign) => (
          <div
            key={campaign.id}
            className="glass-panel rounded-2xl p-5 border border-white/10 hover:border-brand-emerald/30 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 font-mono">
                    {campaign.network}
                  </span>
                  {campaign.hot && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-brand-rose/20 text-brand-rose border border-brand-rose/30 flex items-center gap-1">
                      <Award className="w-3 h-3" /> HOT
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{campaign.category}</span>
              </div>

              <h3 className="text-base font-extrabold text-white mb-2 leading-snug">
                {campaign.title}
              </h3>

              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                {campaign.description}
              </p>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-dark-950/70 border border-white/5 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hoa hồng</span>
                  <strong className="text-brand-emerald font-bold">{campaign.commission}</strong>
                </div>
                <div className="border-x border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-0.5">EPC Ước tính</span>
                  <strong className="text-white font-bold font-mono">{campaign.epc}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Tỷ lệ chuyển đổi</span>
                  <strong className="text-brand-cyan font-bold font-mono">{campaign.conversionRate}</strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-3">
              <a
                href={`/ai-copilot`}
                className="text-xs text-brand-cyan hover:text-white flex items-center gap-1 font-semibold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Viết Kịch Bản Bán Hàng</span>
              </a>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={() => {
                    setCampaign({
                      campaignName: campaign.title,
                      niche: campaign.category,
                      targetProduct: campaign.title,
                      commissionRate: campaign.commission,
                      commissionPerSale: parseInt(campaign.commission.replace(/\D/g, '')) || 240000,
                      utmLink: `${campaign.affiliateUrl}&utm_source=orh_auto&utm_campaign=session_01`
                    })
                    runManualStep(1)
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-emerald/15 hover:bg-brand-emerald/25 text-brand-emerald text-xs font-bold border border-brand-emerald/30 transition-all flex items-center gap-1"
                  title="Đặt chiến dịch này làm mục tiêu chính cho Phiên kiếm tiền #1"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Chọn Phiên #1</span>
                </button>

                <button
                  onClick={() => handleCopyLink(campaign.id, campaign.affiliateUrl)}
                  className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-200 text-xs font-medium border border-white/10 flex items-center gap-1.5 transition-all"
                >
                  {copiedId === campaign.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-brand-emerald" />
                      <span className="text-brand-emerald">Đã chép link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao Chép Link</span>
                    </>
                  )}
                </button>

                <SafeLink
                  href={campaign.affiliateUrl}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
                >
                  <span title="Mở link đối tác">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </SafeLink>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
