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
  Layers,
  ScanSearch,
  BrainCircuit,
  Loader2,
  X,
  TriangleAlert,
} from 'lucide-react'
import { useAiConnections, useAiProviders, sendAgentRun } from '../lib/hooks'
import { ApiError } from '../lib/api'
import { AiModelSelector } from './AiModelSelector'

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
  /** Node do AI quét và đề xuất (không có trong dữ liệu gốc). */
  aiGenerated?: boolean
  /** Điểm cơ hội 0–100 do AI chấm (chỉ cho node AI). */
  score?: number
  /** Lý do 1 câu vì sao đây là vùng tối ưu (chỉ cho node AI). */
  rationale?: string
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

/**
 * Prompt yêu cầu agent (có web_search) nghiên cứu trend MMO/affiliate Việt Nam
 * hiện tại và trả về các ngách MỚI dưới dạng JSON chuẩn để vẽ lên graph.
 */
function buildNicheScanPrompt(existingLabels: string[], linkableIds: string[]): string {
  return [
    'Bạn là chuyên gia nghiên cứu thị trường MMO/affiliate Việt Nam.',
    'Nhiệm vụ: dùng web_search để tìm các xu hướng kiếm tiền online / tiếp thị liên kết ĐANG LÊN tại Việt Nam trong năm 2026,',
    'rồi đề xuất 3–5 NGÁCH MỚI tiềm năng nhất mà chưa có trong danh sách sau:',
    existingLabels.map((l) => `- ${l}`).join('\n'),
    '',
    'QUY TẮC OUTPUT (bắt buộc): chỉ trả về DUY NHẤT một khối JSON trong ```json ... ```, không thêm chữ nào ngoài khối JSON.',
    'Mỗi phần tử là một ngách với đúng các trường:',
    '{ "id": "slug_ngach_viet_khong_dau", "label": "Ngách: <tên tiếng Việt>",',
    '  "roi": "<ví dụ: 350% ROI>", "commission": "<ví dụ: 20% - 40% Recurring>",',
    '  "trafficStrategy": "<chiến lược kéo traffic 1 câu>", "recommendedModel": "<mô hình AI gợi ý>",',
    '  "tosCaution": "<lưu ý tuân thủ ToS 1 câu>", "score": <0-100 điểm cơ hội>,',
    '  "rationale": "<1 câu vì sao đây là vùng tối ưu>",',
    `  "suggestedLinks": ["<chọn 1-3 id trong: ${linkableIds.join(', ')}>"] }`,
    'Chấm score dựa trên: độ nóng trend, hoa hồng, rào cản gia nhập thấp, phù hợp traffic video ngắn.',
  ].join('\n')
}

/** Prompt yêu cầu agent phân tích chuyên sâu một node ngách (trend, cạnh tranh, sub-ngách). */
function buildNodeAnalysisPrompt(node: GraphNode): string {
  const d = node.details
  return [
    `Phân tích chuyên sâu ngách "${node.label}" cho thị trường kiếm tiền online Việt Nam năm 2026.`,
    d ? `Dữ liệu hiện có: ROI ${d.roi}, hoa hồng ${d.commission}, chiến lược traffic: ${d.trafficStrategy}.` : '',
    'Dùng web_search để kiểm chứng trend hiện tại, rồi trả lời bằng tiếng Việt theo đúng cấu trúc:',
    '1. NHIỆT ĐỘ TREND: đang lên/đi ngang/hạ nhiệt + bằng chứng 1-2 dòng.',
    '2. MỨC CẠNH TRANH: thấp/trung bình/cao + ai đang làm tốt.',
    '3. 3 SUB-NGÁCH TỐI ƯU: ngách con ít cạnh tranh hơn nhưng vẫn thơm (mỗi cái 1 dòng + vì sao).',
    '4. CHIẾN LƯỢC TRAFFIC ĐỀ XUẤT: kênh cụ thể + format content + tần suất.',
    '5. RỦI RO & ToS: điều cần tránh.',
    'Ngắn gọn, mỗi mục tối đa 4 dòng. Không hứa hẹn thu nhập chắc chắn.',
  ].join('\n')
}

/** Bóc mảng JSON từ câu trả lời của agent (chịu được ```json fence hoặc JSON trần). */
function extractJsonArray(text: string): unknown[] | null {
  const candidates: string[] = []
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/)
  if (fenced) candidates.push(fenced[1])
  const bracket = text.match(/\[[\s\S]*\]/)
  if (bracket) candidates.push(bracket[0])
  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c.trim())
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* thử candidate tiếp theo */
    }
  }
  return null
}

interface AiNicheSuggestion {
  id?: unknown
  label?: unknown
  roi?: unknown
  commission?: unknown
  trafficStrategy?: unknown
  recommendedModel?: unknown
  tosCaution?: unknown
  score?: unknown
  rationale?: unknown
  suggestedLinks?: unknown
}

/** Validate + chuẩn hóa một suggestion thành GraphNode. Trả null nếu thiếu trường bắt buộc. */
function toAiNode(s: AiNicheSuggestion, index: number): GraphNode | null {
  if (typeof s.label !== 'string' || !s.label.trim()) return null
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim() : fb)
  const score = typeof s.score === 'number' ? Math.max(0, Math.min(100, Math.round(s.score))) : 70
  const angle = (index / 5) * 2 * Math.PI - Math.PI / 2
  return {
    id: `ai_niche_${typeof s.id === 'string' && s.id.trim() ? s.id.trim().replace(/[^a-z0-9_]/gi, '').toLowerCase() : `scan${Date.now() % 100000}_${index}`}`,
    label: s.label.trim(),
    category: 'niche',
    val: 18 + Math.round(score / 12),
    color: '#10B981',
    aiGenerated: true,
    score,
    rationale: str(s.rationale, 'Ngách mới do AI phát hiện từ trend hiện tại.'),
    x: 400 + Math.cos(angle) * 250,
    y: 260 + Math.sin(angle) * 190,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    details: {
      roi: str(s.roi, 'Đang đánh giá'),
      commission: str(s.commission, 'Đang đánh giá'),
      trafficStrategy: str(s.trafficStrategy, 'Ưu tiên video ngắn TikTok/Reels/Shorts.'),
      recommendedModel: str(s.recommendedModel, 'Gemini Flash'),
      tosCaution: str(s.tosCaution, 'Tuân thủ ToS nền tảng và ghi rõ disclosure affiliate.'),
    },
  }
}

/**
 * Dựng sẵn prompt tạo kịch bản từ dữ liệu của node đang chọn, để trang AI Copilot
 * tự nạp vào ô nhập liệu (qua query param ?prompt=...).
 */
function buildNodePrompt(node: GraphNode | null): string {
  if (!node) return 'Tạo kịch bản video TikTok 60 giây.'
  const d = node.details
  const lines = [`Tạo kịch bản video TikTok 60 giây cho ${node.label}.`]
  if (d) {
    lines.push(`Hiệu quả kỳ vọng: ${d.roi}.`)
    lines.push(`Tỷ lệ hoa hồng: ${d.commission}.`)
    lines.push(`Chiến lược kéo traffic: ${d.trafficStrategy}.`)
    lines.push(`Mô hình AI khuyến nghị: ${d.recommendedModel}.`)
    lines.push(`Bắt buộc tuân thủ ToS: ${d.tosCaution}.`)
  }
  lines.push(
    'Kịch bản gồm: hook 3 giây giữ chân người xem, 3 phân đoạn nội dung (mỗi đoạn có gợi ý hình ảnh + lời thoại), caption gợi ý kèm hashtag, và phần kiểm tra tuân thủ ToS ở cuối.',
  )
  return lines.join('\n')
}

export function InteractiveKnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(DEFAULT_NODES[0])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>(DEFAULT_LINKS)

  // ── AI Niche Scanner: agent tìm ngách mới & vùng tối ưu ──
  // Cấu trúc chọn provider/model bê nguyên từ AI Chat Pro
  const { providers } = useAiProviders()
  const { connections } = useAiConnections()
  const [providerId, setProviderId] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const activeConns = connections.filter((c) => c.status === 'active')
  const activeMeta = providers.filter((p) => activeConns.some((c) => c.provider === p.id))
  const currentMeta = providers.find((p) => p.id === providerId)

  // Mặc định chọn provider active đầu tiên + model mặc định của nó
  useEffect(() => {
    if (!providerId && activeMeta.length > 0) {
      setProviderId(activeMeta[0].id)
      setModel(activeMeta[0].defaultModel)
    }
  }, [providerId, activeMeta])

  // Đổi provider → reset model về default nếu model hiện tại không thuộc provider mới
  useEffect(() => {
    if (currentMeta && model && !currentMeta.models.includes(model)) {
      setModel(currentMeta.defaultModel)
    }
  }, [currentMeta, model])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiInsightFor, setAiInsightFor] = useState<string | null>(null)

  const aiNodes = nodes.filter((n) => n.aiGenerated).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const requireProvider = (): string | null => {
    if (!providerId) {
      setScanError('Chưa kết nối AI provider nào. Hãy vào Cài đặt → AI Pro để kết nối key trước khi dùng AI quét ngách.')
      return null
    }
    return providerId
  }

  /** Agent research trend MMO 2026 → đề xuất ngách mới → vẽ lên graph. */
  const handleScan = async () => {
    if (scanning) return
    const provider = requireProvider()
    if (!provider) return
    setScanning(true)
    setScanError(null)
    try {
      const res = await sendAgentRun(
        provider,
        [{ role: 'user' as const, content: buildNicheScanPrompt(nodes.map((n) => n.label), nodes.map((n) => n.id)) }],
        model || undefined,
        { maxTurns: 10, tools: ['web_search', 'fetch_url', 'get_current_time'], maxTokens: 4096 },
      )
      const parsed = extractJsonArray(res.content)
      if (!parsed || parsed.length === 0) {
        throw new Error('AI không trả về danh sách ngách hợp lệ. Hãy bấm quét lại.')
      }
      const knownIds = new Set(nodes.map((n) => n.id))
      const newNodes: GraphNode[] = []
      const newLinks: GraphLink[] = []
      parsed.slice(0, 5).forEach((raw) => {
        const s = raw as AiNicheSuggestion
        const node = toAiNode(s, newNodes.length)
        if (!node || knownIds.has(node.id)) return
        knownIds.add(node.id)
        newNodes.push(node)
        const targets = Array.isArray(s.suggestedLinks) ? (s.suggestedLinks as unknown[]) : []
        targets.slice(0, 3).forEach((t) => {
          if (typeof t === 'string' && knownIds.has(t) && t !== node.id) {
            newLinks.push({ source: node.id, target: t, label: 'AI đề xuất' })
          }
        })
      })
      if (newNodes.length === 0) throw new Error('AI không đề xuất được ngách mới nào. Hãy bấm quét lại.')
      setNodes((prev) => [...prev, ...newNodes])
      setLinks((prev) => [...prev, ...newLinks])
      setSelectedNode(newNodes[0])
    } catch (err) {
      setScanError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Quét ngách thất bại. Hãy thử lại.',
      )
    } finally {
      setScanning(false)
    }
  }

  /** Xóa toàn bộ node/link do AI đề xuất, giữ nguyên dữ liệu gốc. */
  const clearAiNodes = () => {
    const aiIds = new Set(nodes.filter((n) => n.aiGenerated).map((n) => n.id))
    if (aiIds.size === 0) return
    setNodes((prev) => prev.filter((n) => !n.aiGenerated))
    setLinks((prev) => prev.filter((l) => !aiIds.has(l.source) && !aiIds.has(l.target)))
    setSelectedNode((prev) => (prev && aiIds.has(prev.id) ? null : prev))
  }

  /** Agent phân tích chuyên sâu node đang chọn (trend, cạnh tranh, sub-ngách). */
  const handleAnalyze = async () => {
    if (!selectedNode || analyzing) return
    const provider = requireProvider()
    if (!provider) return
    setAnalyzing(true)
    try {
      const res = await sendAgentRun(
        provider,
        [{ role: 'user' as const, content: buildNodeAnalysisPrompt(selectedNode) }],
        model || undefined,
        { maxTurns: 8, tools: ['web_search', 'fetch_url', 'get_current_time'] },
      )
      setAiInsight(res.content)
      setAiInsightFor(selectedNode.id)
    } catch (err) {
      setAiInsight(err instanceof ApiError ? `Lỗi: ${err.message}` : 'Phân tích thất bại. Hãy thử lại.')
      setAiInsightFor(selectedNode.id)
    } finally {
      setAnalyzing(false)
    }
  }

  // Đổi node chọn → xóa insight cũ
  useEffect(() => {
    setAiInsight(null)
    setAiInsightFor(null)
  }, [selectedNode?.id])

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

        // Vòng đứt nét cho node do AI đề xuất (vùng tối ưu)
        if (node.aiGenerated) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.val + 5, 0, Math.PI * 2)
          ctx.setLineDash([5, 4])
          ctx.lineWidth = 2
          ctx.strokeStyle = '#10B981'
          ctx.stroke()
          ctx.setLineDash([])
          ctx.font = 'bold 9px Plus Jakarta Sans'
          ctx.fillStyle = '#10B981'
          ctx.textAlign = 'center'
          ctx.fillText('✦ AI', node.x, node.y - node.val - 9)
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

  // URL sang AI Copilot: mang theo prompt + tự chạy + provider/model đang chọn
  const copilotParams = new URLSearchParams()
  copilotParams.set('prompt', buildNodePrompt(selectedNode))
  copilotParams.set('autorun', '1')
  if (providerId) copilotParams.set('provider', providerId)
  if (model) copilotParams.set('model', model)
  const copilotUrl = `/ai-copilot?${copilotParams.toString()}`

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

      {/* AI Niche Scanner toolbar */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {/* Chọn provider/model — cùng cấu trúc với AI Chat Pro */}
        <AiModelSelector
          providerId={providerId}
          onProviderChange={setProviderId}
          model={model}
          onModelChange={setModel}
          activeMeta={activeMeta}
          currentMeta={currentMeta}
        />
        <button
          onClick={handleScan}
          disabled={scanning}
          className="py-2.5 px-4 rounded-lg bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center gap-2 hover:opacity-95 shadow-glow-emerald transition-all disabled:opacity-60 disabled:cursor-wait"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
          <span>{scanning ? 'AI đang quét trend & tìm ngách...' : 'AI Quét Ngách Tối Ưu'}</span>
        </button>
        {aiNodes.length > 0 && (
          <button
            onClick={clearAiNodes}
            className="py-2.5 px-3 rounded-lg border border-white/10 text-slate-300 text-xs font-medium flex items-center gap-1.5 hover:text-white hover:border-white/25 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>Xóa {aiNodes.length} gợi ý AI</span>
          </button>
        )}
        <span className="text-[11px] text-slate-500">
          {currentMeta
            ? `Dùng key ${currentMeta.name} · model ${model || currentMeta.defaultModel} để quét trend MMO 2026, đề xuất ngách mới và vẽ lên bản đồ.`
            : 'Kết nối key AI ở Cài đặt → AI Pro để bật quét ngách.'}
        </span>
      </div>
      {scanError && (
        <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-200 text-xs flex items-start gap-2">
          <span className="font-bold shrink-0">⚠</span>
          <span>{scanError}</span>
        </div>
      )}

      {/* Bảng xếp hạng ngách AI đề xuất */}
      {aiNodes.length > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-dark-900/60 border border-brand-emerald/20">
          <p className="text-xs font-bold text-brand-emerald mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> TOP NGÁCH AI ĐỀ XUẤT — các vùng tối ưu nhất
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {aiNodes.map((n, i) => (
              <button
                key={n.id}
                onClick={() => setSelectedNode(n)}
                className="text-left p-3 rounded-lg bg-dark-850/80 border border-white/5 hover:border-brand-emerald/40 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white truncate">
                    #{i + 1} {n.label}
                  </span>
                  <span className="text-xs font-extrabold text-brand-emerald shrink-0">{n.score}/100</span>
                </div>
                <div className="h-1.5 mt-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-emerald to-brand-cyan"
                    style={{ width: `${n.score ?? 0}%` }}
                  />
                </div>
                {n.rationale && (
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{n.rationale}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  {selectedNode.aiGenerated && (
                    <div className="p-3 rounded-lg bg-brand-emerald/10 border border-brand-emerald/30 flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5 text-brand-emerald">
                        <Sparkles className="w-3.5 h-3.5" /> Điểm cơ hội AI:
                      </span>
                      <strong className="text-brand-emerald font-extrabold text-sm">{selectedNode.score}/100</strong>
                    </div>
                  )}
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

          <div className="pt-4 border-t border-white/10 mt-4 space-y-2">
            {/* Chọn AI phân tích node — cùng cấu trúc AI Chat Pro, đồng bộ với toolbar */}
            <div className="flex gap-2">
              <AiModelSelector
                providerId={providerId}
                onProviderChange={setProviderId}
                model={model}
                onModelChange={setModel}
                activeMeta={activeMeta}
                currentMeta={currentMeta}
                fullWidth
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !selectedNode}
              className="w-full py-2.5 px-4 rounded-lg border border-brand-violet/40 text-brand-violet font-bold text-xs flex items-center justify-center gap-2 hover:bg-brand-violet/10 transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
              <span>{analyzing ? 'AI đang phân tích...' : 'AI Phân Tích Chuyên Sâu Node Này'}</span>
            </button>
            {aiInsight && aiInsightFor === selectedNode?.id && (
              <div className="p-3 rounded-lg bg-dark-850/80 border border-brand-violet/25 text-xs text-slate-200 leading-relaxed whitespace-pre-line max-h-72 overflow-y-auto">
                {aiInsight}
              </div>
            )}
            <a
              href={copilotUrl}
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
