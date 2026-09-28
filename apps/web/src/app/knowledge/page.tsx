'use client'

import { useRef, useState } from 'react'
import {
  BookOpen,
  Upload,
  Link2,
  Type as TypeIcon,
  Loader2,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  File as FileIcon,
} from 'lucide-react'
import { useRagDocuments, uploadRagDocument, deleteRagDocument } from '../../lib/hooks'
import { ApiError } from '../../lib/api'
import type { RagDocStatus, RagSourceType } from '../../lib/types'

type Tab = 'file' | 'url' | 'text'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB theo contract backend
const ACCEPT = '.txt,.md,.pdf,.png,.jpg,.jpeg,.csv'

function sourceBadge(sourceType: RagSourceType) {
  switch (sourceType) {
    case 'file':
      return {
        label: 'File',
        icon: FileIcon,
        cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      }
    case 'url':
      return {
        label: 'URL',
        icon: Link2,
        cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      }
    case 'text':
      return {
        label: 'Văn bản',
        icon: TypeIcon,
        cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      }
  }
}

function statusBadge(status: RagDocStatus) {
  switch (status) {
    case 'processing':
      return {
        label: 'Đang xử lý',
        icon: Clock,
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      }
    case 'ready':
      return {
        label: 'Sẵn sàng',
        icon: CheckCircle2,
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      }
    case 'failed':
      return {
        label: 'Lỗi',
        icon: XCircle,
        cls: 'bg-red-500/15 text-red-300 border-red-500/30',
      }
  }
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-violet/60 focus:ring-1 focus:ring-brand-violet/30'

export default function KnowledgePage() {
  const { documents, loading, error, refresh } = useRagDocuments()
  const [tab, setTab] = useState<Tab>('file')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasProcessing = documents.some((d) => d.status === 'processing')

  const handleUpload = async () => {
    setUploadError(null)
    try {
      if (tab === 'file') {
        if (!selectedFile) {
          setUploadError('Hãy chọn một file trước khi tải lên.')
          return
        }
        if (selectedFile.size > MAX_FILE_SIZE) {
          setUploadError('File quá lớn. Giới hạn tối đa 10MB.')
          return
        }
        setUploading(true)
        await uploadRagDocument({ file: selectedFile })
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else if (tab === 'url') {
        const u = url.trim()
        if (!u) {
          setUploadError('Hãy nhập đường dẫn URL trước.')
          return
        }
        setUploading(true)
        await uploadRagDocument({ url: u })
        setUrl('')
      } else {
        if (!textTitle.trim() || !textContent.trim()) {
          setUploadError('Hãy nhập đầy đủ tiêu đề và nội dung văn bản.')
          return
        }
        setUploading(true)
        await uploadRagDocument({ title: textTitle.trim(), text: textContent.trim() })
        setTextTitle('')
        setTextContent('')
      }
      await refresh()
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Tải lên thất bại. Hãy thử lại.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Xóa tài liệu "${title}" khỏi kho tri thức?`)) return
    setDeletingId(id)
    try {
      await deleteRagDocument(id)
      await refresh()
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Xóa thất bại. Hãy thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Upload }[] = [
    { id: 'file', label: 'File', icon: Upload },
    { id: 'url', label: 'URL', icon: Link2 },
    { id: 'text', label: 'Văn bản', icon: TypeIcon },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-brand-violet to-brand-cyan flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-dark-950" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Kho tri thức</h1>
          <p className="text-xs text-slate-400">
            Thêm tài liệu để AI trả lời dựa trên dữ liệu của bạn — hỗ trợ 5 kiến trúc RAG
            trong AI Chat Pro.
          </p>
        </div>
      </div>

      {/* Upload card */}
      <div className="glass-panel rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex gap-2">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  setUploadError(null)
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  active
                    ? 'bg-gradient-to-r from-brand-violet to-brand-cyan text-dark-950'
                    : 'bg-dark-950/70 text-slate-400 border border-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'file' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-6 rounded-xl border-2 border-dashed border-white/15 hover:border-brand-violet/50 transition-colors text-center"
            >
              {selectedFile ? (
                <span className="text-sm text-white font-medium">{selectedFile.name}</span>
              ) : (
                <span className="text-sm text-slate-500">
                  Bấm để chọn file <span className="text-slate-600">(.txt, .md, .pdf, .png, .jpg, .csv — tối đa 10MB)</span>
                </span>
              )}
            </button>
          </div>
        )}

        {tab === 'url' && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            className={inputCls}
          />
        )}

        {tab === 'text' && (
          <div className="space-y-3">
            <input
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Tiêu đề tài liệu"
              className={inputCls}
            />
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Dán nội dung văn bản vào đây…"
              rows={6}
              className={`${inputCls} resize-y`}
            />
          </div>
        )}

        {uploadError && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Đang tải lên…' : 'Tải lên'}
        </button>
      </div>

      {/* Document list */}
      <div className="glass-panel rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-white">
            Tài liệu <span className="text-slate-500 font-medium">({documents.length})</span>
          </h2>
          <button
            onClick={refresh}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
              hasProcessing
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Đang tải danh sách…
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm text-slate-500">
              Chưa có tài liệu nào. Tải file, dán URL hoặc thêm văn bản ở trên để bắt đầu.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const src = sourceBadge(doc.sourceType)
              const st = statusBadge(doc.status)
              const SrcIcon = src.icon
              const StIcon = st.icon
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-dark-950/70 border border-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{doc.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${src.cls}`}>
                        <SrcIcon className="w-3 h-3" />
                        {src.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${st.cls}`}>
                        <StIcon className="w-3 h-3" />
                        {st.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {doc.chunkCount} chunks
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {new Date(doc.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    {doc.status === 'failed' && doc.error && (
                      <p className="text-[11px] text-red-400 mt-1">{doc.error}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id, doc.title)}
                    disabled={deletingId === doc.id}
                    title="Xóa tài liệu"
                    className="p-2 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors disabled:opacity-40"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
