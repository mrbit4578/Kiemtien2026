'use client'

import React, { useEffect, useRef, useState } from 'react'
import { 
  Network, 
  Sparkles, 
  Filter, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Share2,
  Layers
} from 'lucide-react'

export interface GraphNode {
  id: string
  label: string
  category: 'niche' | 'platform' | 'product' | 'channel' | 'payout'
  val: number // size
  color: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  details?: {
    roi: string
    commission: string
    trafficStrategy: string
    recommendedModel: string
    tosCaution: string
  }
}

export interface GraphLink {
  source: string
  target: string
  label?: string
}

const DEFAULT_NODES: GraphNode[] = [
  // Niches
  { 
    id: 'niche_ai', 
    label: 'Ngách: Công Cụ AI & SaaS', 
    category: 'niche', 
    val: 28, 
    color: '#8B5CF6',
    details: {
      roi: '380% ROI',
      commission: '30% - 50% Recurring',
      trafficStrategy: 'Làm video demo use-case thực tế trên TikTok & YouTube Shorts',
      recommendedModel: 'Gemini 1.5 Pro / DeepSeek V3',
      tosCaution: 'Phải ghi rõ disclosure affiliate trong mô tả video.'
    }
  },
  { 
    id: 'niche_finance', 
    label: 'Ngách: Tài Chính & Fintech', 
    category: 'niche', 
    val: 26, 
    color: '#10B981',
    details: {
      roi: '450% ROI',
      commission: '300.000₫ - 1.200.000₫ / Mở thẻ',
      trafficStrategy: 'Bài viết so sánh ưu đãi thẻ, hoàn tiền trên blog & fanpage',
      recommendedModel: 'OpenAI GPT-4o',
      tosCaution: 'Tuân thủ nghiêm ngặt quy định không cam kết lợi nhuận tài chính.'
    }
  },
  { 
    id: 'niche_gadget', 
    label: 'Ngách: Đồ Công Nghệ & Decor', 
    category: 'niche', 
    val: 24, 
    color: '#06B6D4',
    details: {
      roi: '220% ROI',
      commission: '8% - 15% / Đơn hàng',
      trafficStrategy: 'Video unboxing, setup bàn làm việc tối giản, góc học tập',
      recommendedModel: 'Gemini Flash',
      tosCaution: 'Sử dụng nhạc thương mại được cấp phép trên TikTok/Reels.'
    }
  },
  { 
    id: 'niche_health', 
    label: 'Ngách: Sức Khỏe & Dinh Dưỡng', 
    category: 'niche', 
    val: 22, 
    color: '#F59E0B',
    details: {
      roi: '290% ROI',
      commission: '15% - 25% / Sản phẩm',
      trafficStrategy: 'Chia sẻ nhật ký giảm cân, tips ăn uống heathy kèm link giỏ hàng',
      recommendedModel: 'Claude 3.5 Sonnet',
      tosCaution: 'Không quảng cáo chữa dứt điểm bệnh, tránh vi phạm ToS y tế.'
    }
  },

  // Networks / Platforms
  { id: 'net_tiktok', label: 'TikTok Shop Affiliate', category: 'platform', val: 24, color: '#EC4899' },
  { id: 'net_shopee', label: 'Shopee Affiliate VN', category: 'platform', val: 24, color: '#F97316' },
  { id: 'net_accesstrade', label: 'AccessTrade Ecosystem', category: 'platform', val: 22, color: '#10B981' },
  { id: 'net_amazon', label: 'Amazon Associates', category: 'platform', val: 20, color: '#3B82F6' },

  // Traffic Channels
  { id: 'chan_tiktok', label: 'TikTok Kênh Review (Video Ngắn)', category: 'channel', val: 20, color: '#EC4899' },
  { id: 'chan_reels', label: 'Meta Instagram Reels', category: 'channel', val: 18, color: '#A855F7' },
  { id: 'chan_youtube', label: 'YouTube Shorts + Community', category: 'channel', val: 19, color: '#EF4444' },
  { id: 'chan_blog', label: 'Website SEO Đánh Giá', category: 'channel', val: 17, color: '#06B6D4' },

  // Products
  { id: 'prod_notion', label: 'Template Notion & AI Workflows', category: 'product', val: 16, color: '#6366F1' },
  { id: 'prod_mic', label: 'Mic Thu Âm Không Dây Gắn Áo', category: 'product', val: 15, color: '#38BDF8' },
  { id: 'prod_bank', label: 'Mở Tài Khoản Số / Thẻ VPBank/MB', category: 'product', val: 16, color: '#10B981' },
  { id: 'prod_whey', label: 'Whey Protein & Bột Năng Lượng', category: 'product', val: 14, color: '#F59E0B' },
]

const DEFAULT_LINKS: GraphLink[] = [
  // Links from Niches to Networks
  { source: 'niche_ai', target: 'net_accesstrade', label: 'Chiến dịch SaaS' },
  { source: 'niche_ai', target: 'prod_notion', label: 'Sản phẩm số' },
  { source: 'niche_finance', target: 'net_accesstrade', label: 'D2C Finance' },
  { source: 'niche_finance', target: 'prod_bank', label: 'Hoa hồng cao' },
  { source: 'niche_gadget', target: 'net_tiktok', label: 'Livestream/Video' },
  { source: 'niche_gadget', target: 'net_shopee', label: 'Gắn thẻ link' },
  { source: 'niche_gadget', target: 'prod_mic', label: 'Hot trend' },
  { source: 'niche_health', target: 'net_tiktok', label: 'Giỏ hàng vàng' },
  { source: 'niche_health', target: 'prod_whey', label: 'Bán chạy' },

  // Links to Channels
  { source: 'net_tiktok', target: 'chan_tiktok', label: 'Auto-sync giỏ hàng' },
  { source: 'net_shopee', target: 'chan_reels', label: 'Bio link' },
  { source: 'net_accesstrade', target: 'chan_blog', label: 'Deep link SEO' },
  { source: 'prod_notion', target: 'chan_youtube', label: 'Video hướng dẫn' },
  { source: 'prod_mic', target: 'chan_tiktok', label: 'Gắn link mua' },
]

export function InteractiveKnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(DEFAULT_NODES[0])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>(DEFAULT_LINKS)

  // Initialize node positions
  useEffect(() => {
    const initializedNodes = DEFAULT_NODES.map((n, i) => {
      const angle = (i / DEFAULT_NODES.length) * 2 * Math.PI
      const radius = 140 + (i % 3) * 60
      return {
        ...n,
        x: 400 + Math.cos(angle) * radius,
        y: 260 + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }
    })
    setNodes(initializedNodes)
  }, [])

  // Animation Loop with simple force layout
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.scale(zoomLevel, zoomLevel)
      ctx.translate(-canvas.width / 2, -canvas.height / 2)

      // Draw Links
      links.forEach((link) => {
        const sourceNode = nodes.find((n) => n.id === link.source)
        const targetNode = nodes.find((n) => n.id === link.target)

        if (sourceNode && targetNode && sourceNode.x && sourceNode.y && targetNode.x && targetNode.y) {
          ctx.beginPath()
          ctx.moveTo(sourceNode.x, sourceNode.y)
          ctx.lineTo(targetNode.x, targetNode.y)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Draw small glow pulse dot on link
          const pulse = (Date.now() / 1500) % 1
          const dotX = sourceNode.x + (targetNode.x - sourceNode.x) * pulse
          const dotY = sourceNode.y + (targetNode.y - sourceNode.y) * pulse
          ctx.beginPath()
          ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = '#10B981'
          ctx.fill()
        }
      })

      // Draw Nodes
      nodes.forEach((node) => {
        if (!node.x || !node.y) return

        const isFilteredOut = selectedCategory !== 'all' && node.category !== selectedCategory
        const isSelected = selectedNode?.id === node.id

        // Node circle glow
        if (isSelected) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.val + 8, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(16, 185, 129, 0.25)'
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.val, 0, Math.PI * 2)
        ctx.fillStyle = isFilteredOut ? 'rgba(50, 60, 80, 0.4)' : node.color
        ctx.fill()
        ctx.lineWidth = isSelected ? 3 : 1.5
        ctx.strokeStyle = isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)'
        ctx.stroke()

        // Label text
        ctx.font = isSelected ? 'bold 12px Plus Jakarta Sans' : '11px Plus Jakarta Sans'
        ctx.fillStyle = isFilteredOut ? 'rgba(148, 163, 184, 0.4)' : '#FFFFFF'
        ctx.textAlign = 'center'
        ctx.fillText(node.label, node.x, node.y + node.val + 14)
      })

      ctx.restore()

      // Slight floating motion
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          let x = (n.x || 400) + (n.vx || 0)
          let y = (n.y || 260) + (n.vy || 0)

          // Bounce within bounds
          if (x < 60 || x > 740) n.vx = -(n.vx || 0.2)
          if (y < 60 || y > 460) n.vy = -(n.vy || 0.2)

          return { ...n, x, y }
        })
      )

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [nodes, links, selectedNode, selectedCategory, zoomLevel])

  // Handle Canvas Click to select node
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clickX = (e.clientX - rect.left - canvas.width / 2) / zoomLevel + canvas.width / 2
    const clickY = (e.clientY - rect.top - canvas.height / 2) / zoomLevel + canvas.height / 2

    // Find clicked node
    const found = nodes.find((n) => {
      if (!n.x || !n.y) return false
      const dist = Math.sqrt((n.x - clickX) ** 2 + (n.y - clickY) ** 2)
      return dist <= n.val + 5
    })

    if (found) {
      setSelectedNode(found)
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 shadow-xl">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-brand-violet/20 text-brand-violet border border-brand-violet/30">
              <Network className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-white">Biểu Đồ Tri Thức Kiếm Tiền (Knowledge Graph)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kế thừa Wiki Mode của WeKnora: Trực quan hóa quan hệ giữa Ngách (Niche) → Sản phẩm → Mạng Affiliate → Kênh phân phối
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'niche', label: 'Ngách MMO' },
            { id: 'platform', label: 'Nền tảng' },
            { id: 'product', label: 'Sản phẩm' },
            { id: 'channel', label: 'Kênh Traffic' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
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

      {/* Main interactive area: Canvas + Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Canvas area */}
        <div className="lg:col-span-2 relative rounded-xl overflow-hidden bg-dark-950 border border-white/5">
          <canvas
            ref={canvasRef}
            width={800}
            height={520}
            onClick={handleCanvasClick}
            className="w-full h-[380px] sm:h-[460px] cursor-pointer"
          />

          {/* Canvas Floating Controls */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-dark-900/80 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 1.8))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded"
              title="Phóng to"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.7))}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded"
              title="Đặt lại zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-dark-900/80 border border-white/10 text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
            Nhấp chuột vào một Node để xem chiến lược AI
          </div>
        </div>

        {/* Node Insight Panel */}
        <div className="glass-panel-glow rounded-xl p-5 flex flex-col justify-between">
          {selectedNode ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-dark-950"
                  style={{ backgroundColor: selectedNode.color }}
                >
                  {selectedNode.category}
                </span>
                <span className="text-[11px] text-brand-emerald font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> WeKnora Graph Node
                </span>
              </div>

              <h4 className="text-base font-extrabold text-white mb-2">{selectedNode.label}</h4>

              {selectedNode.details ? (
                <div className="space-y-3 text-xs mt-4">
                  <div className="p-3 rounded-lg bg-dark-850/80 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Hiệu quả kỳ vọng:</span>
                    <strong className="text-brand-emerald font-bold">{selectedNode.details.roi}</strong>
                  </div>

                  <div className="p-3 rounded-lg bg-dark-850/80 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-400">Tỷ lệ hoa hồng:</span>
                    <strong className="text-white font-bold">{selectedNode.details.commission}</strong>
                  </div>

                  <div className="p-3 rounded-lg bg-dark-850/80 border border-white/5">
                    <p className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-brand-cyan" /> Chiến lược kéo Traffic:
                    </p>
                    <p className="text-slate-200 leading-relaxed">{selectedNode.details.trafficStrategy}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-dark-850/80 border border-white/5">
                    <p className="text-slate-400 font-semibold mb-1">Mô hình AI khuyến nghị:</p>
                    <p className="text-brand-violet font-mono font-medium">{selectedNode.details.recommendedModel}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-red-200 text-[11px]">
                    <span className="font-bold text-red-400">Lưu ý ToS:</span> {selectedNode.details.tosCaution}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 mt-4 leading-relaxed">
                  Node này là điểm kết nối trung gian trong mạng lưới tiếp thị liên kết. Kết hợp node này với các ngách lợi nhuận cao để tối ưu chỉ số EPC (Earnings Per Click).
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Vui lòng chọn một Node trên biểu đồ.</p>
          )}

          <div className="pt-4 border-t border-white/10 mt-4">
            <a
              href="/ai-copilot"
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center justify-center gap-2 hover:opacity-95 shadow-glow-emerald transition-all"
            >
              <span>Dùng AI Copilot Tạo Kịch Bản Cho Node Này</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
