'use client'

import React, { useState, useMemo } from 'react'
import {
  CalendarClock,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  ShieldCheck,
  Layers,
  Sparkles,
  Filter
} from 'lucide-react'

// TODO (backend): model ContentItem hiện chưa có các trường mà UI đang hiển thị:
//   - `title` (tạm dùng dòng đầu của caption)
//   - `channels` / kênh đích (tạm để trống)
//   - `affiliateProduct`, `commission` (tạm hiển thị '—')
// Khi backend bổ sung field, cập nhật toUiItem() bên dưới — không bịa dữ liệu.

export interface ContentItem {
  id: string
  title: string
  caption: string
  channels: ('tiktok' | 'instagram' | 'meta' | 'youtube')[]
  scheduledAt: string
  status: 'draft' | 'pending_approval' | 'approved' | 'published'
  affiliateProduct?: string
  commission: string
}

import { useSession } from '../context/SessionContext'
import { useContent, useConnections } from '../lib/hooks'
import type { ApiContentItem } from '../lib/types'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

/** Map status backend (status + approvalStatus) về status hiển thị của UI */
function toUiStatus(a: ApiContentItem): ContentItem['status'] {
  if (a.status === 'published') return 'published'
  if (a.approvalStatus === 'approved') return 'approved'
  if (a.status === 'draft' && a.approvalStatus === 'pending') return 'pending_approval'
  return 'draft'
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Chưa lên lịch'
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toUiItem(a: ApiContentItem): ContentItem {
  const firstLine =
    a.caption
      .split('\n')
      .map((s) => s.trim())
      .find(Boolean) ?? '(Không tiêu đề)'
  return {
    id: a.id,
    title: firstLine.slice(0, 80),
    caption: a.caption,
    channels: [],
    scheduledAt: formatDateTime(a.scheduledAt),
    status: toUiStatus(a),
    affiliateProduct: '—',
    commission: '—',
  }
}

export function ContentStudio() {
  const { sessionData, currentStep, startAutoPilot } = useSession()
  const { items, loading, error, create, approve, publish } = useContent()
  const { connections } = useConnections()
  const activeConnections = useMemo(
    () => connections.filter((c) => c.status === 'active'),
    [connections],
  )

  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCaption, setNewCaption] = useState('')
  const [newProduct, setNewProduct] = useState('')
  const [newScheduled, setNewScheduled] = useState('2026-09-25 19:00')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [opOk, setOpOk] = useState<string | null>(null)
  // connection được chọn cho mỗi bài viết khi publish (mặc định: connection active đầu tiên)
  const [publishConn, setPublishConn] = useState<Record<string, string>>({})

  // ─── DEMO MODE: giữ hành vi giả lập cũ (auto-inject Session #1) ───
  const [demoPosts, setDemoPosts] = useState<ContentItem[]>([])
  React.useEffect(() => {
    if (!DEMO_MODE) return
    if (sessionData.scriptContent) {
      setDemoPosts([
        {
          id: 'session_1_post',
          title: `Phiên #1: ${sessionData.campaignName}`,
          caption: sessionData.scriptContent,
          channels: ['tiktok', 'instagram', 'youtube'],
          scheduledAt: sessionData.scheduledTime,
          status: currentStep >= 4 ? 'approved' : 'pending_approval',
          affiliateProduct: sessionData.targetProduct,
          commission: `${sessionData.commissionRate} (+${sessionData.commissionPerSale.toLocaleString('vi-VN')}₫/đơn)`,
        },
      ])
    } else {
      setDemoPosts([])
    }
  }, [sessionData.scriptContent, sessionData.campaignName, sessionData.scheduledTime, sessionData.targetProduct, sessionData.commissionRate, sessionData.commissionPerSale, currentStep])

  // ─── Mode thường: dữ liệu thật từ GET /content ───
  const apiPosts = useMemo(() => items.map(toUiItem), [items])
  const posts = DEMO_MODE ? demoPosts : apiPosts

  const runOp = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id)
    setOpError(null)
    setOpOk(null)
    try {
      await fn()
      setOpOk(okMsg)
    } catch (err) {
      setOpError(err instanceof Error ? err.message : 'Thao tác thất bại.')
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = (id: string) => {
    if (DEMO_MODE) {
      setDemoPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'approved' } : p)))
      return
    }
    // POST /content/:id/approve — backend đổi approvalStatus, ghi audit log
    runOp(id, () => approve(id, true), 'Đã phê duyệt nội dung.')
  }

  const handlePublish = (id: string) => {
    if (DEMO_MODE) {
      setDemoPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'published' } : p)))
      return
    }
    const connectionId = publishConn[id] ?? activeConnections[0]?.id
    if (!connectionId) {
      setOpError('Chưa có tài khoản nào đang kết nối. Hãy kết nối OAuth trước khi publish.')
      return
    }
    // POST /content/:id/publish — backend kiểm tra approve + consent, tạo Job idempotent
    runOp(
      id,
      () => publish(id, connectionId).then((r) => r),
      'Đã đẩy vào queue publish (job đang chờ worker xử lý).',
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    if (DEMO_MODE) {
      const newPost: ContentItem = {
        id: `cnt_${Date.now()}`,
        title: newTitle,
        caption: newCaption,
        channels: ['tiktok', 'instagram'],
        scheduledAt: newScheduled,
        status: 'pending_approval',
        affiliateProduct: newProduct || 'Sản phẩm tiếp thị',
        commission: '15% - 30%',
      }
      setDemoPosts([newPost, ...demoPosts])
    } else {
      // Backend không có field `title` — gộp tiêu đề vào đầu caption.
      // scheduledAt chuyển sang ISO để qua được @IsDateString của backend.
      setBusyId('__create')
      setOpError(null)
      try {
        const caption = `${newTitle.trim()}\n\n${newCaption.trim()}`
        const d = new Date(newScheduled.replace(' ', 'T'))
        await create({
          caption,
          scheduledAt: !isNaN(d.getTime()) ? d.toISOString() : undefined,
        })
        setOpOk('Đã tạo bài viết (bản nháp, chờ phê duyệt).')
      } catch (err) {
        setOpError(err instanceof Error ? err.message : 'Tạo bài viết thất bại.')
      } finally {
        setBusyId(null)
      }
    }

    setNewTitle('')
    setNewCaption('')
    setNewProduct('')
    setIsModalOpen(false)
  }

  const filteredPosts = posts.filter((p) => {
    if (activeFilter === 'all') return true
    return p.status === activeFilter
  })

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-br from-brand-amber to-brand-rose text-dark-950 shadow-sm">
              <CalendarClock className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-white">Content Studio & Quy Trình Duyệt An Toàn</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chính sách nghiêm ngặt: Tuyệt đối không tự động spam. Mọi nội dung bắt buộc phải duyệt trước khi đẩy vào Queue BullMQ.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center gap-2 hover:opacity-90 shadow-glow-emerald transition-all"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Tạo Bài Viết Mới</span>
        </button>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-xl bg-brand-emerald/10 border border-brand-emerald/25 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-emerald shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-white font-semibold">Cơ Chế Bảo Vệ Chống Vi Phạm ToS:</strong> Hệ thống tự động kiểm tra khóa trùng lặp (`IdempotencyKey`), giới hạn tần suất đăng bài (Rate Limit), và đảm bảo có thẻ khai báo tiếp thị liên kết trước khi kết nối API mạng xã hội.
        </div>
      </div>

      {/* Trạng thái thao tác với API */}
      {opError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{opError}</span>
        </div>
      )}
      {opOk && (
        <div className="p-3.5 rounded-xl bg-brand-emerald/10 border border-brand-emerald/30 flex items-start gap-2.5 text-xs text-brand-emerald">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{opOk}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" /> Bộ lọc:
        </span>
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'draft', label: 'Bản nháp' },
          { id: 'pending_approval', label: 'Chờ phê duyệt' },
          { id: 'approved', label: 'Đã duyệt (Sẵn sàng)' },
          { id: 'published', label: 'Đã xuất bản' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeFilter === f.id
                ? 'bg-white/15 text-white font-bold border border-white/20'
                : 'bg-dark-850 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            {f.label}
          </button>
        ))}
        {!DEMO_MODE && loading && (
          <span className="text-xs text-slate-400">Đang tải từ API...</span>
        )}
      </div>

      {!DEMO_MODE && error && (
        <div className="p-4 rounded-xl bg-brand-amber/10 border border-brand-amber/30 text-xs text-slate-300">
          <strong className="text-white">Không tải được danh sách content:</strong> {error}
        </div>
      )}

      {/* Post List */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 border border-white/10 text-center space-y-4">
            <Sparkles className="w-10 h-10 text-brand-emerald mx-auto animate-pulse" />
            <div className="max-w-md mx-auto space-y-1.5">
              <h4 className="text-base font-bold text-white">Chưa có bài viết trong hàng đợi</h4>
              <p className="text-xs text-slate-400">
                {DEMO_MODE
                  ? 'Toàn bộ dữ liệu ảo đã được reset về 0₫. Hãy kích hoạt Auto-Pilot Phiên #1 để WeKnora Agent tự động sáng tạo kịch bản và đưa vào đây!'
                  : 'Hãy tạo bài viết mới — nội dung sẽ được lưu vào database và phải qua phê duyệt trước khi publish.'}
              </p>
            </div>
            {DEMO_MODE ? (
              <button
                onClick={startAutoPilot}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs shadow-glow-emerald hover:opacity-95 transition-all inline-flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Kích Hoạt Auto-Pilot Phiên #1 Ngay</span>
              </button>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs shadow-glow-emerald hover:opacity-95 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo Bài Viết Đầu Tiên</span>
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => {
          const statusBadge =
            post.status === 'published'
              ? { bg: 'bg-brand-emerald/20 text-brand-emerald border-brand-emerald/30', label: 'ĐÃ XUẤT BẢN' }
              : post.status === 'approved'
              ? { bg: 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/30', label: 'ĐÃ PHÊ DUYỆT' }
              : post.status === 'pending_approval'
              ? { bg: 'bg-brand-amber/20 text-brand-amber border-brand-amber/30', label: 'CHỜ DUYỆT' }
              : { bg: 'bg-slate-700/40 text-slate-300 border-slate-600/30', label: 'BẢN NHÁP' }
          const busy = busyId === post.id

          return (
            <div
              key={post.id}
              className="glass-panel rounded-xl p-5 border border-white/10 hover:border-white/20 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border uppercase tracking-wider ${statusBadge.bg}`}>
                    {statusBadge.label}
                  </span>
                  <h4 className="text-sm font-extrabold text-white">{post.title}</h4>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand-cyan" /> {post.scheduledAt}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-dark-900 border border-white/5 text-brand-emerald font-bold">
                    {post.commission}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 bg-dark-950/60 p-3 rounded-lg border border-white/5 leading-relaxed font-sans whitespace-pre-wrap">
                {post.caption}
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Kênh đích:</span>
                  <div className="flex items-center gap-1.5">
                    {post.channels.length === 0 ? (
                      <span className="text-slate-600 text-[10px]">—</span>
                    ) : (
                      post.channels.map((ch) => (
                        <span key={ch} className="px-2 py-0.5 rounded bg-dark-850 text-slate-200 border border-white/10 text-[10px] uppercase font-bold">
                          {ch}
                        </span>
                      ))
                    )}
                  </div>
                  <span className="text-slate-600">|</span>
                  <span>Sản phẩm: <strong className="text-white">{post.affiliateProduct}</strong></span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {post.status === 'pending_approval' && (
                    <button
                      onClick={() => handleApprove(post.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-brand-cyan/20 hover:bg-brand-cyan/30 text-brand-cyan border border-brand-cyan/30 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{busy ? 'Đang xử lý...' : 'Phê Duyệt Nội Dung'}</span>
                    </button>
                  )}

                  {post.status === 'approved' && (
                    <>
                      {!DEMO_MODE && activeConnections.length > 1 && (
                        <select
                          value={publishConn[post.id] ?? activeConnections[0]?.id ?? ''}
                          onChange={(e) =>
                            setPublishConn((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                          className="text-xs bg-dark-950 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200 focus:border-brand-emerald focus:outline-none"
                          title="Chọn tài khoản để publish"
                        >
                          {activeConnections.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.provider} ({c.providerUserId})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handlePublish(post.id)}
                        disabled={busy || (!DEMO_MODE && activeConnections.length === 0)}
                        title={!DEMO_MODE && activeConnections.length === 0 ? 'Cần kết nối tài khoản OAuth trước' : undefined}
                        className="px-3.5 py-1.5 rounded-lg bg-brand-emerald text-dark-950 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 shadow-glow-emerald transition-all disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{busy ? 'Đang đẩy...' : 'Đẩy Lên Queue Publish'}</span>
                      </button>
                    </>
                  )}

                  {post.status === 'published' && (
                    <span className="text-xs text-brand-emerald flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-4 h-4" /> Đã đăng thành công
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })
        )}
      </div>

      {/* Simple Modal Create */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel-glow bg-dark-900 rounded-2xl p-6 max-w-lg w-full border border-brand-emerald/30 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-white">Soạn Thảo Bài Viết Mới & Lên Lịch</h3>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tiêu đề nội dung:</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Review Trải Nghiệm Mua Sắm Shopee..."
                  className="w-full bg-dark-950 p-2.5 rounded-lg border border-white/10 text-white focus:border-brand-emerald focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Sản phẩm / Chiến dịch Affiliate:</label>
                <input
                  type="text"
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  placeholder="Ví dụ: Bàn phím cơ không dây Bluetooth"
                  className="w-full bg-dark-950 p-2.5 rounded-lg border border-white/10 text-white focus:border-brand-emerald focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nội dung Caption & Hashtags:</label>
                <textarea
                  rows={4}
                  required
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Nhập caption hoặc dán kịch bản do AI Copilot tạo ra..."
                  className="w-full bg-dark-950 p-2.5 rounded-lg border border-white/10 text-white focus:border-brand-emerald focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Thời gian lên lịch xuất bản:</label>
                <input
                  type="text"
                  value={newScheduled}
                  onChange={(e) => setNewScheduled(e.target.value)}
                  className="w-full bg-dark-950 p-2.5 rounded-lg border border-white/10 text-white font-mono focus:border-brand-emerald focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 border border-white/10"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={busyId === '__create'}
                  className="px-4 py-2 rounded-lg bg-brand-emerald text-dark-950 font-bold shadow-glow-emerald disabled:opacity-50"
                >
                  {busyId === '__create' ? 'Đang lưu...' : 'Lưu & Gửi Phê Duyệt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
