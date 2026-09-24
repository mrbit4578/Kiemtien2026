'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, ArrowLeft, Clapperboard, AlertTriangle, Trash2, Send, ShieldCheck,
  Bot, ClipboardCheck, Gauge, Save, CheckCircle2, XCircle, Link2, Sparkles,
  FileText, Scale, BrainCircuit,
} from 'lucide-react'
import {
  useVideoProjects,
  getVideoProject,
  updateVideoProject,
  updateVideoGates,
  scoreVideoRisk,
  getVideoReadiness,
  sendVideoToContentStudio,
  addVideoAsset,
  setVideoAssetStatus,
  deleteVideoAsset,
  addVideoClaim,
  setVideoClaimStatus,
  deleteVideoClaim,
  addVideoAiEntry,
  setVideoAiLabel,
  deleteVideoAiEntry,
} from '../../lib/hooks'
import {
  VIDEO_STAGES,
  VIDEO_STAGE_LABELS,
  GATE_LABELS,
  type VideoProjectSummary,
  type VideoProjectDetail,
  type GateState,
  type RiskResult,
  type PublishReadiness,
} from '../../lib/types'

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: FileText },
  { id: 'script', label: 'Kịch bản', icon: Clapperboard },
  { id: 'assets', label: 'Quyền', icon: Scale },
  { id: 'claims', label: 'Kiểm chứng', icon: ShieldCheck },
  { id: 'ai', label: 'AI Register', icon: BrainCircuit },
  { id: 'qa', label: 'QA & Risk', icon: Gauge },
] as const

type TabId = (typeof TABS)[number]['id']

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-emerald/60'
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5'
const btnPrimary =
  'px-4 py-2 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50'
const btnGhost =
  'px-4 py-2 rounded-xl border border-dark-700 text-slate-300 text-xs font-semibold hover:border-brand-emerald/50 hover:text-white transition-all'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

function riskBadge(score: number | null) {
  if (score === null || score === undefined)
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800 text-slate-400">Chưa chấm</span>
  const cls =
    score <= 3
      ? 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30'
      : score <= 7
        ? 'bg-brand-amber/15 text-brand-amber border-brand-amber/30'
        : 'bg-red-500/15 text-red-300 border-red-500/30'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${cls}`}>
      Risk {score}/18
    </span>
  )
}

/* ─── Trang chính ─── */

export default function VideoFacelessPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return selectedId ? (
    <ProjectDetail id={selectedId} onBack={() => setSelectedId(null)} />
  ) : (
    <ProjectList onSelect={setSelectedId} />
  )
}

/* ─── Danh sách dự án ─── */

function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
  const { projects, loading, error, create, remove } = useVideoProjects()
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('')
  const [viralSourceUrl, setViralSourceUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const doCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const p = await create({
        title: title.trim(),
        series: series.trim() || undefined,
        viralSourceUrl: viralSourceUrl.trim() || undefined,
      })
      setShowNew(false)
      setTitle(''); setSeries(''); setViralSourceUrl('')
      onSelect(p.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-brand-emerald" />
            Video Faceless
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Pipeline từ tín hiệu viral → sản phẩm gốc: brief qua G0 originality,
            claim ledger, rights ledger, AI register, 8 cổng QA, risk score —
            rồi gửi sang Content Studio để xuất bản.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className={btnPrimary}>
          <Plus className="w-4 h-4" /> Dự án mới
        </button>
      </div>

      <div className="p-4 rounded-xl bg-brand-cyan/5 border border-brand-cyan/20 flex items-start gap-3">
        <Bot className="w-5 h-5 text-brand-cyan shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-white">Làm cùng AI:</span> mở{' '}
          <Link href="/ai-chat" className="text-brand-cyan underline font-semibold">
            AI Chat Pro (chế độ Agent)
          </Link>{' '}
          và nhờ agent chạy pipeline: <code className="text-brand-emerald">video_brief</code> (phân tích
          nguồn viral → chốt góc qua G0) → <code className="text-brand-emerald">video_script</code> (viết
          kịch bản, chặn claim chưa xác minh) → <code className="text-brand-emerald">video_risk_score</code> (chấm
          rủi ro). Kết quả dán vào các tab bên dưới để lưu vào dự án.
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Đang tải dự án…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && projects.length === 0 && (
        <div className="p-10 rounded-2xl border border-dashed border-dark-700 text-center">
          <Clapperboard className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Chưa có dự án nào. Tạo dự án đầu tiên từ một video viral bạn muốn học hỏi.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="p-4 rounded-2xl bg-dark-900/60 border border-dark-700 hover:border-brand-emerald/40 cursor-pointer transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-sm text-white line-clamp-2">{p.title}</h3>
              {riskBadge(p.riskScore)}
            </div>
            {p.series && <p className="text-[11px] text-brand-cyan mt-1">Series: {p.series}</p>}
            <div className="flex items-center gap-2 mt-3 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/25 font-semibold">
                {VIDEO_STAGE_LABELS[p.stage] ?? p.stage}
              </span>
              <span className="text-slate-500">
                {p.assetCount} asset · {p.claimCount} claim · {p.aiEntryCount} AI
              </span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] text-slate-500">{timeAgo(p.updatedAt)}</span>
              {p.contentItemId ? (
                <span className="text-[11px] text-brand-emerald flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Đã sang Content Studio
                </span>
              ) : confirmDelete === p.id ? (
                <span className="flex gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(p.id); setConfirmDelete(null) }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 font-bold"
                  >
                    Xóa thật?
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }}
                    className="text-[11px] px-2 py-1 rounded-lg border border-dark-700 text-slate-400"
                  >
                    Hủy
                  </button>
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); setTimeout(() => setConfirmDelete(null), 4000) }}
                  className="text-[11px] text-slate-500 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md p-6 rounded-2xl bg-dark-900 border border-dark-700 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-white">Dự án video mới</h2>
            <div>
              <label className={labelCls}>Tiêu đề *</label>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: 3 sai lầm khiến điều hòa tốn điện gấp đôi" />
            </div>
            <div>
              <label className={labelCls}>Series format (không bắt buộc)</label>
              <input className={inputCls} value={series} onChange={(e) => setSeries(e.target.value)} placeholder="VD: 3 phút kiểm chứng" />
            </div>
            <div>
              <label className={labelCls}>URL video viral tham khảo (chỉ để phân tích — không tải lại)</label>
              <input className={inputCls} value={viralSourceUrl} onChange={(e) => setViralSourceUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className={btnGhost}>Hủy</button>
              <button onClick={doCreate} disabled={!title.trim() || creating} className={btnPrimary}>
                {creating ? 'Đang tạo…' : 'Tạo dự án'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Chi tiết dự án ─── */

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = useState<VideoProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('overview')

  const refresh = useCallback(async () => {
    try {
      setProject(await getVideoProject(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dự án')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setStage = async (stage: string) => {
    if (!project || stage === project.stage) return
    await updateVideoProject(id, { stage })
    setProject({ ...project, stage })
  }

  if (loading) return <p className="text-sm text-slate-400">Đang tải dự án…</p>
  if (error || !project) return <p className="text-sm text-red-300">{error ?? 'Không tìm thấy dự án'}</p>

  const stageIdx = VIDEO_STAGES.indexOf(project.stage as (typeof VIDEO_STAGES)[number])

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Tất cả dự án
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white">{project.title}</h1>
          {project.series && <p className="text-xs text-brand-cyan mt-0.5">Series: {project.series}</p>}
        </div>
        {riskBadge(project.riskScore)}
      </div>

      {/* Stepper 10 bước */}
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {VIDEO_STAGES.map((s, i) => {
          const done = i < stageIdx
          const current = i === stageIdx
          return (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                current
                  ? 'bg-brand-emerald/20 text-brand-emerald border-brand-emerald/40'
                  : done
                    ? 'bg-dark-800 text-slate-300 border-dark-700 hover:border-brand-emerald/40'
                    : 'bg-dark-900 text-slate-500 border-dark-800 hover:border-dark-600'
              }`}
            >
              <span className="opacity-60 mr-1">{i + 1}</span>
              {VIDEO_STAGE_LABELS[s]}
            </button>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-dark-800">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                tab === t.id
                  ? 'text-brand-emerald border-brand-emerald'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.id === 'assets' && project.assets.length > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-dark-800 text-[10px]">{project.assets.length}</span>
              )}
              {t.id === 'claims' && project.claims.length > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-dark-800 text-[10px]">{project.claims.length}</span>
              )}
              {t.id === 'ai' && project.aiEntries.length > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-dark-800 text-[10px]">{project.aiEntries.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && <OverviewTab project={project} onSaved={refresh} />}
      {tab === 'script' && <ScriptTab project={project} onSaved={refresh} />}
      {tab === 'assets' && <AssetsTab project={project} onChanged={refresh} />}
      {tab === 'claims' && <ClaimsTab project={project} onChanged={refresh} />}
      {tab === 'ai' && <AiRegisterTab project={project} onChanged={refresh} />}
      {tab === 'qa' && <QaRiskTab project={project} onChanged={refresh} />}
    </div>
  )
}

/* ─── Tab: Tổng quan ─── */

function OverviewTab({ project, onSaved }: { project: VideoProjectDetail; onSaved: () => void }) {
  const [viralSourceUrl, setViralSourceUrl] = useState(project.viralSourceUrl ?? '')
  const [sourceNote, setSourceNote] = useState(project.sourceNote ?? '')
  const [angle, setAngle] = useState(project.angle ?? '')
  const [publishNotes, setPublishNotes] = useState(project.publishNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateVideoProject(project.id, { viralSourceUrl, sourceNote, angle, publishNotes })
      onSaved()
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  let brief: Record<string, unknown> | null = null
  try {
    brief = project.briefJson ? JSON.parse(project.briefJson) : null
  } catch { /* brief không phải JSON hợp lệ */ }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="p-4 rounded-xl bg-brand-amber/5 border border-brand-amber/20 text-xs text-slate-300 leading-relaxed">
        <span className="font-bold text-brand-amber">Nguyên tắc:</span> video viral là{' '}
        <span className="font-semibold text-white">tín hiệu nghiên cứu</span>, không phải nguyên liệu.
        Không tải lại, không đọc lại lời, không dựng lại montage của nguồn.
      </div>

      <div>
        <label className={labelCls}>URL video viral tham khảo</label>
        <input className={inputCls} value={viralSourceUrl} onChange={(e) => setViralSourceUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div>
        <label className={labelCls}>Phân tích nguồn (bước 2) — chủ đề / hook / claim / format / phản ứng khán giả</label>
        <textarea className={inputCls} rows={4} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="Video nói về… hook là… claim chính chưa kiểm chứng là… khán giả comment hỏi nhiều về…" />
      </div>
      <div>
        <label className={labelCls}>Góc mới đã chọn (bước 3) — phải qua G0 originality test</label>
        <textarea className={inputCls} rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="VD: Kiểm chứng 3 điều kiện để mẹo đúng + chỉ ra trường hợp thất bại" />
      </div>

      {brief && (
        <div>
          <label className={labelCls}>Brief từ tool video_brief</label>
          <pre className="p-3 rounded-lg bg-dark-950 border border-dark-700 text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(brief, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <label className={labelCls}>Ghi chú xuất bản — disclosure (affiliate / tài trợ / AI label / nguồn nhạc)</label>
        <textarea className={inputCls} rows={3} value={publishNotes} onChange={(e) => setPublishNotes(e.target.value)} placeholder="VD: Có link affiliate VPBank → disclosure trong video. Voice AI → bật label AI TikTok." />
      </div>

      <button onClick={save} disabled={saving} className={btnPrimary}>
        <Save className="w-4 h-4" /> {saving ? 'Đang lưu…' : savedTick ? 'Đã lưu ✓' : 'Lưu thay đổi'}
      </button>
    </div>
  )
}

/* ─── Tab: Kịch bản ─── */

function ScriptTab({ project, onSaved }: { project: VideoProjectDetail; onSaved: () => void }) {
  const [script, setScript] = useState(project.script ?? '')
  const [caption, setCaption] = useState(project.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateVideoProject(project.id, { script, caption })
      onSaved()
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="p-4 rounded-xl bg-brand-cyan/5 border border-brand-cyan/20 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-brand-cyan shrink-0 mt-0.5" />
        <p className="text-xs text-slate-300 leading-relaxed">
          Nhờ agent (chế độ Agent trong{' '}
          <Link href="/ai-chat" className="text-brand-cyan underline font-semibold">AI Chat Pro</Link>)
          chạy <code className="text-brand-emerald">video_script</code> — tool tự chặn claim rủi ro cao
          chưa xác minh và trả đúng 3 khối (Kịch bản / Caption / Lưu ý đăng bài). Dán kết quả vào 2 ô dưới rồi lưu.
        </p>
      </div>
      <div>
        <label className={labelCls}>Kịch bản quay/dựng (khối ## KỊCH BẢN QUAY)</label>
        <textarea className={`${inputCls} font-mono`} rows={10} value={script} onChange={(e) => setScript(e.target.value)} placeholder="Phân cảnh, lời thoại/voice-over, text trên màn hình, thời lượng…" />
      </div>
      <div>
        <label className={labelCls}>Caption đăng bài (khối ## CAPTION ĐĂNG BÀI)</label>
        <textarea className={inputCls} rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="1 HOOK + 2–3 câu ngắn + 1 CTA (link trong bio) + 5–8 hashtag" />
      </div>
      <button onClick={save} disabled={saving} className={btnPrimary}>
        <Save className="w-4 h-4" /> {saving ? 'Đang lưu…' : savedTick ? 'Đã lưu ✓' : 'Lưu kịch bản'}
      </button>
    </div>
  )
}

/* ─── Tab: Rights ledger ─── */

const ASSET_TYPES: Record<string, string> = {
  video: 'Video', image: 'Ảnh', music: 'Nhạc', voice: 'Giọng đọc',
  font: 'Font', template: 'Template', screenshot: 'Screenshot', logo: 'Logo',
}
const RIGHTS_BASIS: Record<string, string> = {
  original: 'Tự tạo (original)', license: 'Mua license', public_domain: 'Public domain',
  permission: 'Xin phép văn bản', platform_library: 'Thư viện nền tảng', quotation_review: 'Trích dẫn đang review',
}
const ASSET_STATUS: Record<string, { label: string; cls: string }> = {
  cleared: { label: 'Đã duyệt', cls: 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30' },
  conditional: { label: 'Có điều kiện', cls: 'bg-brand-amber/15 text-brand-amber border-brand-amber/30' },
  pending: { label: 'Chờ duyệt', cls: 'bg-dark-700 text-slate-300 border-dark-600' },
  reject: { label: 'Từ chối', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

function AssetsTab({ project, onChanged }: { project: VideoProjectDetail; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState('music')
  const [rightsBasis, setRightsBasis] = useState('platform_library')
  const [owner, setOwner] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setAdding(true)
    try {
      await addVideoAsset(project.id, {
        name: name.trim(), assetType, rightsBasis,
        owner: owner.trim() || undefined, sourceUrl: sourceUrl.trim() || undefined,
      })
      setName(''); setOwner(''); setSourceUrl('')
      onChanged()
    } finally {
      setAdding(false)
    }
  }

  const cycleStatus = async (assetId: string, current: string) => {
    const order = ['pending', 'conditional', 'cleared', 'reject']
    const next = order[(order.indexOf(current) + 1) % order.length]
    await setVideoAssetStatus(project.id, assetId, next)
    onChanged()
  }

  const pendingCount = project.assets.filter((a) => a.status !== 'cleared').length

  return (
    <div className="space-y-4 max-w-4xl">
      {pendingCount > 0 && (
        <div className="p-3.5 rounded-xl bg-brand-amber/10 border border-brand-amber/30 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Còn {pendingCount} asset chưa cleared — <span className="font-bold">không được xuất bản</span> cho đến khi tất cả cleared.
        </div>
      )}

      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <p className="text-xs font-bold text-white">Thêm asset vào rights ledger</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Tên asset *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nhạc nền — Audio Library track X" />
          </div>
          <div>
            <label className={labelCls}>Loại</label>
            <select className={inputCls} value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              {Object.entries(ASSET_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cơ sở quyền</label>
            <select className={inputCls} value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value)}>
              {Object.entries(RIGHTS_BASIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Chủ sở hữu</label>
            <input className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="VD: YouTube Audio Library" />
          </div>
          <div>
            <label className={labelCls}>URL nguồn</label>
            <input className={inputCls} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <button onClick={add} disabled={!name.trim() || adding} className={btnPrimary}>
          <Plus className="w-4 h-4" /> {adding ? 'Đang thêm…' : 'Thêm asset'}
        </button>
      </div>

      <div className="space-y-2">
        {project.assets.map((a) => {
          const st = ASSET_STATUS[a.status] ?? ASSET_STATUS.pending
          return (
            <div key={a.id} className="p-3 rounded-xl bg-dark-900/60 border border-dark-700 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                <p className="text-[11px] text-slate-500">
                  {ASSET_TYPES[a.assetType] ?? a.assetType} · {RIGHTS_BASIS[a.rightsBasis] ?? a.rightsBasis}
                  {a.owner ? ` · ${a.owner}` : ''}
                </p>
              </div>
              <button
                onClick={() => cycleStatus(a.id, a.status)}
                title="Bấm để đổi trạng thái"
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-bold ${st.cls}`}
              >
                {st.label}
              </button>
              <button
                onClick={async () => { await deleteVideoAsset(project.id, a.id); onChanged() }}
                className="shrink-0 text-slate-500 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}
        {project.assets.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">Chưa có asset nào. Thêm nhạc, hình, voice… kèm cơ sở quyền của từng cái.</p>
        )}
      </div>
    </div>
  )
}

/* ─── Tab: Claim ledger ─── */

const CLAIM_TYPES: Record<string, string> = {
  fact: 'Dữ kiện', interpretation: 'Diễn giải', forecast: 'Dự báo',
  allegation: 'Cáo buộc', opinion: 'Ý kiến',
}
const RISK_LEVELS: Record<string, { label: string; cls: string }> = {
  low: { label: 'Thấp', cls: 'text-slate-400' },
  medium: { label: 'Trung bình', cls: 'text-brand-amber' },
  high: { label: 'Cao', cls: 'text-orange-400' },
  critical: { label: 'Nghiêm trọng', cls: 'text-red-300 font-bold' },
}
const CONFIDENCE: Record<string, string> = {
  confirmed: 'Đã xác minh', probable: 'Khá chắc', disputed: 'Đang tranh cãi', unverified: 'Chưa xác minh',
}

function ClaimsTab({ project, onChanged }: { project: VideoProjectDetail; onChanged: () => void }) {
  const [claimText, setClaimText] = useState('')
  const [claimType, setClaimType] = useState('fact')
  const [riskLevel, setRiskLevel] = useState('low')
  const [confidence, setConfidence] = useState('unverified')
  const [primarySource, setPrimarySource] = useState('')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!claimText.trim()) return
    setAdding(true)
    try {
      await addVideoClaim(project.id, {
        claimText: claimText.trim(), claimType, riskLevel, confidence,
        primarySource: primarySource.trim() || undefined,
      })
      setClaimText(''); setPrimarySource(''); setConfidence('unverified')
      onChanged()
    } finally {
      setAdding(false)
    }
  }

  const riskyOpen = project.claims.filter(
    (c) => c.confidence === 'unverified' && ['high', 'critical'].includes(c.riskLevel) && c.status === 'open',
  )

  return (
    <div className="space-y-4 max-w-4xl">
      {riskyOpen.length > 0 && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {riskyOpen.length} claim rủi ro cao/nghiêm trọng chưa xác minh — phải xác minh hoặc gỡ/hạ wording trước khi xuất bản.
        </div>
      )}

      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <p className="text-xs font-bold text-white">Thêm claim vào claim ledger</p>
        <div>
          <label className={labelCls}>Nội dung claim * (nguyên văn trong kịch bản)</label>
          <textarea className={inputCls} rows={2} value={claimText} onChange={(e) => setClaimText(e.target.value)} placeholder="VD: Vệ sinh lưới lọc giúp điều hòa tiết kiệm 15% điện" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Loại</label>
            <select className={inputCls} value={claimType} onChange={(e) => setClaimType(e.target.value)}>
              {Object.entries(CLAIM_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Mức rủi ro</label>
            <select className={inputCls} value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
              {Object.entries(RISK_LEVELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Độ chắc chắn</label>
            <select className={inputCls} value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              {Object.entries(CONFIDENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Nguồn chính</label>
            <input className={inputCls} value={primarySource} onChange={(e) => setPrimarySource(e.target.value)} placeholder="URL / tên tài liệu" />
          </div>
        </div>
        <button onClick={add} disabled={!claimText.trim() || adding} className={btnPrimary}>
          <Plus className="w-4 h-4" /> {adding ? 'Đang thêm…' : 'Thêm claim'}
        </button>
      </div>

      <div className="space-y-2">
        {project.claims.map((c) => (
          <div key={c.id} className="p-3 rounded-xl bg-dark-900/60 border border-dark-700 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">{c.claimText}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {CLAIM_TYPES[c.claimType] ?? c.claimType} ·{' '}
                <span className={RISK_LEVELS[c.riskLevel]?.cls}>{RISK_LEVELS[c.riskLevel]?.label}</span> ·{' '}
                {CONFIDENCE[c.confidence] ?? c.confidence} · {c.status === 'open' ? 'đang mở' : c.status === 'corrected' ? 'đã sửa' : 'đã gỡ'}
                {c.primarySource ? ` · Nguồn: ${c.primarySource}` : ''}
              </p>
            </div>
            <select
              value={c.status}
              onChange={async (e) => { await setVideoClaimStatus(project.id, c.id, e.target.value); onChanged() }}
              className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 text-slate-300"
            >
              <option value="open">Đang mở</option>
              <option value="corrected">Đã sửa</option>
              <option value="withdrawn">Đã gỡ</option>
            </select>
            <button
              onClick={async () => { await deleteVideoClaim(project.id, c.id); onChanged() }}
              className="shrink-0 text-slate-500 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {project.claims.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">Chưa có claim nào. Mỗi câu có thể kiểm chứng trong kịch bản nên có một dòng ở đây.</p>
        )}
      </div>
    </div>
  )
}

/* ─── Tab: AI Register ─── */

const AI_CATEGORIES: Record<string, string> = {
  A0: 'A0 — Không dùng AI',
  A1: 'A1 — AI hỗ trợ (brainstorm, sửa lỗi)',
  A2: 'A2 — AI tạo hình minh họa hư cấu rõ ràng',
  A3: 'A3 — AI tạo/sửa giọng, mặt, sự kiện chân thực',
  A4: 'A4 — Mô phỏng người thật (cần consent)',
}

function AiRegisterTab({ project, onChanged }: { project: VideoProjectDetail; onChanged: () => void }) {
  const [assetName, setAssetName] = useState('')
  const [tool, setTool] = useState('')
  const [category, setCategory] = useState('A1')
  const [realPerson, setRealPerson] = useState(false)
  const [consentStatus, setConsentStatus] = useState('na')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async () => {
    if (!assetName.trim() || !tool.trim()) return
    setAdding(true)
    setErr(null)
    try {
      await addVideoAiEntry(project.id, {
        assetName: assetName.trim(), tool: tool.trim(), category, realPerson, consentStatus,
      })
      setAssetName(''); setTool(''); setRealPerson(false)
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi thêm mục AI')
    } finally {
      setAdding(false)
    }
  }

  const needLabel = project.aiEntries.filter((e) => e.labelRequired && !e.labelApplied)

  return (
    <div className="space-y-4 max-w-4xl">
      {needLabel.length > 0 && (
        <div className="p-3.5 rounded-xl bg-brand-amber/10 border border-brand-amber/30 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {needLabel.length} mục AI chân thực (A3/A4) chưa bật label — bắt buộc bật disclosure của nền tảng trước khi đăng.
        </div>
      )}

      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <p className="text-xs font-bold text-white">Thêm mục AI register</p>
        {err && <p className="text-xs text-red-300">{err}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Asset dùng AI *</label>
            <input className={inputCls} value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="VD: Voice-over tập 1" />
          </div>
          <div>
            <label className={labelCls}>Công cụ *</label>
            <input className={inputCls} value={tool} onChange={(e) => setTool(e.target.value)} placeholder="VD: Agent Kiemtien2026, TTS…" />
          </div>
          <div>
            <label className={labelCls}>Phân loại</label>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(AI_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={realPerson} onChange={(e) => setRealPerson(e.target.checked)} className="accent-brand-emerald" />
            Liên quan người thật
          </label>
          <div>
            <label className={labelCls}>Consent</label>
            <select className={inputCls} value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)}>
              <option value="na">Không áp dụng</option>
              <option value="obtained">Đã có văn bản</option>
              <option value="none">Chưa có</option>
            </select>
          </div>
        </div>
        <button onClick={add} disabled={!assetName.trim() || !tool.trim() || adding} className={btnPrimary}>
          <Plus className="w-4 h-4" /> {adding ? 'Đang thêm…' : 'Thêm mục'}
        </button>
      </div>

      <div className="space-y-2">
        {project.aiEntries.map((e) => (
          <div key={e.id} className="p-3 rounded-xl bg-dark-900/60 border border-dark-700 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{e.assetName}</p>
              <p className="text-[11px] text-slate-500">
                {e.tool} · {AI_CATEGORIES[e.category] ?? e.category}
                {e.realPerson ? ' · người thật' : ''}
                {e.consentStatus && e.consentStatus !== 'na' ? ` · consent: ${e.consentStatus}` : ''}
              </p>
            </div>
            {e.labelRequired && (
              <button
                onClick={async () => { await setVideoAiLabel(project.id, e.id, !e.labelApplied); onChanged() }}
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-bold ${
                  e.labelApplied
                    ? 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30'
                    : 'bg-brand-amber/15 text-brand-amber border-brand-amber/30'
                }`}
              >
                {e.labelApplied ? 'Đã label ✓' : 'Chưa label'}
              </button>
            )}
            <button
              onClick={async () => { await deleteVideoAiEntry(project.id, e.id); onChanged() }}
              className="shrink-0 text-slate-500 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {project.aiEntries.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">Chưa có mục AI nào.</p>
        )}
      </div>
    </div>
  )
}

/* ─── Tab: QA & Risk ─── */

const RISK_FIELDS = [
  { key: 'c', label: 'C — Copyright & license' },
  { key: 'p', label: 'P — Privacy, likeness, voice' },
  { key: 'l', label: 'L — Legal / reputation' },
  { key: 'a', label: 'A — Accuracy & misinformation' },
  { key: 'm', label: 'M — Monetization / platform policy' },
  { key: 'h', label: 'H — Harm (health, safety, finance)' },
] as const

function QaRiskTab({ project, onChanged }: { project: VideoProjectDetail; onChanged: () => void }) {
  const [gates, setGates] = useState<Record<string, GateState>>(() => {
    try {
      return project.gatesJson ? JSON.parse(project.gatesJson) : {}
    } catch {
      return {}
    }
  })
  const [savingGates, setSavingGates] = useState(false)

  const [risk, setRisk] = useState<Record<string, number>>(() => {
    try {
      return project.riskBreakdown ? JSON.parse(project.riskBreakdown) : { c: 0, p: 0, l: 0, a: 0, m: 0, h: 0 }
    } catch {
      return { c: 0, p: 0, l: 0, a: 0, m: 0, h: 0 }
    }
  })
  const [a4NoConsent, setA4NoConsent] = useState(false)
  const [criticalUnverified, setCriticalUnverified] = useState(false)
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null)
  const [scoring, setScoring] = useState(false)

  const [readiness, setReadiness] = useState<PublishReadiness | null>(null)
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<string | null>(null)

  const saveGates = async () => {
    setSavingGates(true)
    try {
      await updateVideoGates(project.id, gates)
      onChanged()
    } finally {
      setSavingGates(false)
    }
  }

  const doScore = async () => {
    setScoring(true)
    try {
      const res = await scoreVideoRisk(project.id, {
        c: risk.c, p: risk.p, l: risk.l, a: risk.a, m: risk.m, h: risk.h,
        a4NoConsent, criticalHealthClaimUnverified: criticalUnverified,
      })
      setRiskResult(res)
      onChanged()
    } finally {
      setScoring(false)
    }
  }

  const doCheck = async () => {
    setChecking(true)
    try {
      setReadiness(await getVideoReadiness(project.id))
    } finally {
      setChecking(false)
    }
  }

  const doSend = async () => {
    setSending(true)
    setSendMsg(null)
    try {
      const res = await sendVideoToContentStudio(project.id)
      setSendMsg(`Đã tạo bản nháp trong Content Studio ✓`)
      onChanged()
    } catch (e) {
      setSendMsg(e instanceof Error ? e.message : 'Gửi thất bại')
    } finally {
      setSending(false)
    }
  }

  const gatesPassed = Object.keys(GATE_LABELS).filter((g) => gates[g]?.pass).length

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 8 cổng QA */}
      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-brand-emerald" />
            8 cổng QA — {gatesPassed}/8 pass
          </p>
          <button onClick={saveGates} disabled={savingGates} className={btnGhost}>
            <Save className="w-3.5 h-3.5" /> {savingGates ? 'Đang lưu…' : 'Lưu gates'}
          </button>
        </div>
        <div className="space-y-2">
          {Object.entries(GATE_LABELS).map(([gid, label]) => (
            <div key={gid} className="flex items-start gap-3 p-2.5 rounded-lg bg-dark-950/60 border border-dark-800">
              <button
                onClick={() => setGates({ ...gates, [gid]: { ...gates[gid], pass: !gates[gid]?.pass } })}
                className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                  gates[gid]?.pass
                    ? 'bg-brand-emerald border-brand-emerald text-dark-950'
                    : 'border-dark-600 text-transparent hover:border-brand-emerald/50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-200">
                  <span className="text-brand-cyan font-bold mr-1.5">{gid}</span>
                  {label}
                </p>
                <input
                  className="mt-1.5 w-full px-2.5 py-1.5 rounded-lg bg-dark-900 border border-dark-800 text-[11px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-emerald/50"
                  value={gates[gid]?.note ?? ''}
                  onChange={(e) => setGates({ ...gates, [gid]: { pass: !!gates[gid]?.pass, note: e.target.value } })}
                  placeholder="Ghi chú (không bắt buộc)…"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk score */}
      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-amber" />
          Risk score — R = C + P + L + A + M + H (mỗi yếu tố 0–3)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RISK_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={3} step={1}
                  value={risk[f.key] ?? 0}
                  onChange={(e) => setRisk({ ...risk, [f.key]: Number(e.target.value) })}
                  className="flex-1 accent-brand-amber"
                />
                <span className="text-sm font-bold text-white w-5 text-center">{risk[f.key] ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-red-300">
            <input type="checkbox" checked={a4NoConsent} onChange={(e) => setA4NoConsent(e.target.checked)} className="accent-red-500" />
            Veto: mô phỏng người thật (A4) nhưng KHÔNG có consent văn bản → REJECT ngay
          </label>
          <label className="flex items-center gap-2 text-xs text-red-300">
            <input type="checkbox" checked={criticalUnverified} onChange={(e) => setCriticalUnverified(e.target.checked)} className="accent-red-500" />
            Veto: claim sức khỏe/tài chính mức critical chưa xác minh → REJECT ngay
          </label>
        </div>
        <button onClick={doScore} disabled={scoring} className={btnPrimary}>
          <Gauge className="w-4 h-4" /> {scoring ? 'Đang chấm…' : 'Chấm điểm rủi ro'}
        </button>
        {riskResult && (
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
            riskResult.veto || riskResult.score >= 8
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : riskResult.score >= 4
                ? 'bg-brand-amber/10 border-brand-amber/30 text-amber-200'
                : 'bg-brand-emerald/10 border-brand-emerald/30 text-emerald-200'
          }`}>
            <p className="font-bold text-sm">
              {riskResult.veto ? '⛔ VETO' : `Risk score: ${riskResult.score}/18`}
            </p>
            <p className="mt-1">{riskResult.decision}</p>
            <p className="mt-1 opacity-70">
              (C{riskResult.breakdown.c} P{riskResult.breakdown.p} L{riskResult.breakdown.l} A{riskResult.breakdown.a} M{riskResult.breakdown.m} H{riskResult.breakdown.h})
            </p>
          </div>
        )}
      </div>

      {/* Xuất bản */}
      <div className="p-4 rounded-xl bg-dark-900/60 border border-dark-700 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-brand-cyan" />
          Xuất bản — gửi sang Content Studio
        </p>
        <p className="text-[11px] text-slate-500">
          Hệ thống chặn nếu còn asset chưa cleared hoặc claim rủi ro cao chưa xác minh.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={doCheck} disabled={checking} className={btnGhost}>
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra điều kiện xuất bản'}
          </button>
          <button onClick={doSend} disabled={sending || !!project.contentItemId} className={btnPrimary}>
            <Send className="w-4 h-4" />
            {project.contentItemId ? 'Đã gửi sang Content Studio ✓' : sending ? 'Đang gửi…' : 'Gửi sang Content Studio'}
          </button>
        </div>
        {readiness && (
          <div className={`p-3 rounded-xl border text-xs ${
            readiness.ready
              ? 'bg-brand-emerald/10 border-brand-emerald/30 text-emerald-200'
              : 'bg-brand-amber/10 border-brand-amber/30 text-amber-200'
          }`}>
            {readiness.ready ? (
              <p className="font-bold">✓ Đủ điều kiện xuất bản — có thể gửi sang Content Studio.</p>
            ) : (
              <div className="space-y-1">
                <p className="font-bold">Chưa đủ điều kiện:</p>
                {readiness.blockingAssets.map((a) => (
                  <p key={a.id}>• Asset "{a.name}" — {ASSET_STATUS[a.status]?.label ?? a.status}</p>
                ))}
                {readiness.riskyClaims.map((c) => (
                  <p key={c.id}>• Claim chưa xác minh: "{c.claimText}…"</p>
                ))}
              </div>
            )}
          </div>
        )}
        {sendMsg && <p className="text-xs text-slate-300">{sendMsg}</p>}
        {project.contentItemId && (
          <Link href="/content" className="inline-flex items-center gap-1.5 text-xs text-brand-cyan underline">
            <Link2 className="w-3.5 h-3.5" /> Mở Content Studio để duyệt & publish
          </Link>
        )}
      </div>
    </div>
  )
}
