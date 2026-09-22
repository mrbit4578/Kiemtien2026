'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

type Template = { id: string; title: string; thumbnailUrl?: string }
type Design = { id: string; title: string; thumbnailUrl?: string; pageCount?: number }
type DatasetField = { name: string; type: string }

/**
 * Đoán giá trị điền sẵn cho từng trường dataset từ nội dung Final Answer.
 * Heuristic đơn giản theo tên trường (headline/title/caption/...), user
 * vẫn sửa tay được trước khi chạy.
 */
function guessFieldValue(fieldName: string, answer: string): string {
  const key = fieldName.toLowerCase()
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean)
  if (/headline|title|tiêu đề/.test(key)) {
    const hit = lines.find((l) => /top \d|tiêu đề/i.test(l))
    return (hit ?? lines[0] ?? '').replace(/^[*#\-\s]+/, '').slice(0, 80)
  }
  if (/caption|mô tả|description/.test(key)) {
    const hit = lines.find((l) => /caption/i.test(l))
    return (hit ?? '').replace(/^[*#\-\s]+/, '').slice(0, 200)
  }
  if (/cta|call/.test(key)) {
    const hit = lines.find((l) => /bấm|nhận|tại liệu|cta/i.test(l))
    return (hit ?? '').replace(/^[*#\-\s]+/, '').slice(0, 80)
  }
  if (/hashtag/.test(key)) {
    const hit = lines.find((l) => /#/.test(l))
    return (hit ?? '').slice(0, 200)
  }
  return ''
}

export function CanvaAutofillModal({ answer, onClose }: { answer: string; onClose: () => void }) {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [designs, setDesigns] = useState<Design[]>([])
  const [loadingDesigns, setLoadingDesigns] = useState(false)
  const [designsError, setDesignsError] = useState<string | null>(null)
  const [selectedDesignId, setSelectedDesignId] = useState<string>('')
  const [designPageCount, setDesignPageCount] = useState<number | null>(null)
  const [loadingPageCount, setLoadingPageCount] = useState(false)
  /** Các trang được chọn để xuất (1-based). Mảng rỗng = xuất toàn bộ. */
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [fields, setFields] = useState<DatasetField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [format, setFormat] = useState<'png' | 'jpg' | 'mp4'>('png')
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api
      .get<{ templates: Template[] }>('/canva/templates')
      .then((d) => {
        const ts = d.templates ?? []
        setTemplates(ts)
        if (ts.length === 1) setSelectedId(ts[0].id)
        // Không có Brand Template (Pro không có tính năng Enterprise) →
        // fallback sang liệt kê thiết kế có sẵn.
        if (ts.length === 0) {
          setLoadingDesigns(true)
          api
            .get<{ designs: Design[] }>('/canva/designs')
            .then((dd) => {
              const ds = dd.designs ?? []
              setDesigns(ds)
              if (ds.length === 1) setSelectedDesignId(ds[0].id)
            })
            .catch((err) => setDesignsError(err instanceof Error ? err.message : 'Không tải được danh sách thiết kế.'))
            .finally(() => setLoadingDesigns(false))
        }
      })
      .catch((err) => setTemplatesError(err instanceof Error ? err.message : 'Không tải được danh sách mẫu.'))
      .finally(() => setLoadingTemplates(false))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setFields([])
      return
    }
    setLoadingFields(true)
    api
      .get<{ fields: DatasetField[] }>(`/canva/templates/${selectedId}/dataset`)
      .then((d) => {
        const fs = d.fields ?? []
        setFields(fs)
        const v: Record<string, string> = {}
        for (const f of fs) v[f.name] = guessFieldValue(f.name, answer)
        setValues(v)
      })
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false))
  }, [selectedId, answer])

  const handleRun = async () => {
    if (!selectedId || running) return
    setRunning(true)
    setRunError(null)
    try {
      await api.post('/canva/autofill-to-content', {
        brandTemplateId: selectedId,
        data: values,
        caption: answer.trim().slice(0, 2000),
        format,
      })
      setDone(true)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Chạy autofill thất bại.')
    } finally {
      setRunning(false)
    }
  }

  /** Khi chọn thiết kế: lấy số trang để cho user chọn trang xuất. */
  useEffect(() => {
    if (!selectedDesignId) {
      setDesignPageCount(null)
      setSelectedPages([])
      return
    }
    setLoadingPageCount(true)
    setDesignPageCount(null)
    setSelectedPages([])
    api
      .get<{ pageCount?: number }>(`/canva/designs/${selectedDesignId}`)
      .then((d) => {
        const n = typeof d.pageCount === 'number' && d.pageCount > 0 ? d.pageCount : 1
        setDesignPageCount(n)
        // Mặc định chọn tất cả trang
        setSelectedPages(Array.from({ length: n }, (_, i) => i + 1))
      })
      .catch(() => {
        setDesignPageCount(1)
        setSelectedPages([1])
      })
      .finally(() => setLoadingPageCount(false))
  }, [selectedDesignId])

  const togglePage = (p: number) => {
    setSelectedPages((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)))
  }

  /** Xuất thiết kế Canva có sẵn → tạo nháp Content Studio (đường vòng cho Pro). */
  const handleExportDesign = async () => {
    if (!selectedDesignId || running) return
    if (selectedPages.length === 0) {
      setRunError('Hãy chọn ít nhất một trang để xuất.')
      return
    }
    setRunning(true)
    setRunError(null)
    try {
      await api.post('/canva/export-to-content', {
        designId: selectedDesignId,
        caption: answer.trim().slice(0, 2000),
        format,
        // Xuất toàn bộ → không gửi pages; chọn một phần → gửi danh sách trang
        pages: designPageCount && selectedPages.length === designPageCount ? undefined : selectedPages,
      })
      setDone(true)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Xuất thiết kế thất bại.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-dark-900 border border-white/10 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <ImagePlus className="w-5 h-5 text-brand-cyan" />
            Canva Autofill → Content Studio
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[12.5px] text-slate-400 mb-5">
          Chọn mẫu bạn đã thiết kế sẵn trong Canva, điền nội dung từ kịch bản AI, chạy autofill —
          file xuất ra sẽ tự tạo bản nháp trong Content Studio chờ bạn duyệt.
        </p>

        {done ? (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-white font-bold">Xong! Bản nháp đã có trong Content Studio.</p>
            <p className="text-[13px] text-slate-400">
              Vào Content Studio duyệt nội dung (Quy trình Duyệt An Toàn) rồi mới đẩy lên queue publish.
            </p>
            <button
              onClick={() => router.push('/content')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-sm"
            >
              Mở Content Studio duyệt bài
            </button>
          </div>
        ) : (
          <>
            {loadingTemplates ? (
              <p className="text-[13px] text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải mẫu từ Canva…
              </p>
            ) : templatesError ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-200 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{templatesError}</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-200">
                  Tài khoản Canva của bạn không có Brand Template (tính năng Enterprise).
                  Dưới đây là các thiết kế có sẵn — chọn một cái để xuất file đưa vào Content Studio.
                </div>
                {loadingDesigns ? (
                  <p className="text-[13px] text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải thiết kế từ Canva…
                  </p>
                ) : designsError ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-200 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{designsError}</span>
                  </div>
                ) : designs.length === 0 ? (
                  <p className="text-[13px] text-slate-500">
                    Không tìm thấy thiết kế nào trong tài khoản Canva. Hãy tạo một thiết kế trong Canva rồi thử lại.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="block text-[12.5px] font-bold text-slate-300 mb-2">1. Chọn thiết kế có sẵn</label>
                      <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                        {designs.map((d) => (
                          <button
                            key={d.id}
                            onClick={() => setSelectedDesignId(d.id)}
                            className={`rounded-xl border p-2.5 text-left transition-colors ${
                              selectedDesignId === d.id
                                ? 'border-brand-cyan bg-brand-cyan/10'
                                : 'border-white/10 hover:border-white/25'
                            }`}
                          >
                            {d.thumbnailUrl && (
                              <img src={d.thumbnailUrl} alt={d.title} className="w-full h-20 object-cover rounded-lg mb-1.5" />
                            )}
                            <span className="block text-[12.5px] font-bold text-white truncate">{d.title}</span>
                            <span className="block text-[11px] text-slate-500 font-mono truncate">{d.id}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12.5px] font-bold text-slate-300 mb-2">2. Chọn trang để xuất</label>
                      {loadingPageCount ? (
                        <p className="text-[13px] text-slate-400 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc số trang…
                        </p>
                      ) : designPageCount && designPageCount > 1 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {Array.from({ length: designPageCount }, (_, i) => i + 1).map((p) => (
                              <button
                                key={p}
                                onClick={() => togglePage(p)}
                                className={`w-11 h-11 rounded-lg text-[13px] font-bold border transition-colors ${
                                  selectedPages.includes(p)
                                    ? 'border-brand-cyan bg-brand-cyan/15 text-white'
                                    : 'border-white/10 text-slate-500 hover:border-white/25'
                                }`}
                                title={selectedPages.includes(p) ? `Bỏ chọn trang ${p}` : `Chọn trang ${p}`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 text-[12px]">
                            <button
                              onClick={() => setSelectedPages(Array.from({ length: designPageCount }, (_, i) => i + 1))}
                              className="text-brand-cyan hover:underline"
                            >
                              Chọn tất cả
                            </button>
                            <button onClick={() => setSelectedPages([])} className="text-slate-400 hover:underline">
                              Bỏ chọn hết
                            </button>
                            <span className="text-slate-500">
                              Đã chọn {selectedPages.length}/{designPageCount} trang
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-slate-500">Thiết kế này có 1 trang — sẽ xuất toàn bộ.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[12.5px] font-bold text-slate-300 mb-2">3. Định dạng xuất</label>
                      <div className="flex gap-2">
                        {(['png', 'jpg', 'mp4'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setFormat(f)}
                            className={`px-4 py-1.5 rounded-lg text-[12.5px] font-bold uppercase border transition-colors ${
                              format === f
                                ? 'border-brand-cyan bg-brand-cyan/10 text-white'
                                : 'border-white/10 text-slate-400 hover:border-white/25'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {runError && <p className="text-[12.5px] text-red-300">{runError}</p>}

                    <button
                      onClick={handleExportDesign}
                      disabled={!selectedDesignId || running}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {running ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Đang xuất file… (có thể mất 1–2 phút)
                        </>
                      ) : (
                        <>
                          <ImagePlus className="w-4 h-4" />
                          Xuất thiết kế → tạo nháp Content Studio
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-[12.5px] font-bold text-slate-300 mb-2">1. Chọn mẫu thiết kế</label>
                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={`rounded-xl border p-2.5 text-left transition-colors ${
                          selectedId === t.id
                            ? 'border-brand-cyan bg-brand-cyan/10'
                            : 'border-white/10 hover:border-white/25'
                        }`}
                      >
                        <span className="block text-[12.5px] font-bold text-white truncate">{t.title}</span>
                        <span className="block text-[11px] text-slate-500 font-mono truncate">{t.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedId && (
                  <div>
                    <label className="block text-[12.5px] font-bold text-slate-300 mb-2">
                      2. Điền nội dung vào mẫu {loadingFields && <Loader2 className="inline w-3.5 h-3.5 animate-spin" />}
                    </label>
                    {fields.length === 0 && !loadingFields ? (
                      <p className="text-[12.5px] text-slate-500">
                        Không đọc được danh sách trường của mẫu này. Bạn vẫn có thể chạy với dữ liệu trống.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {fields.map((f) => (
                          <div key={f.name}>
                            <label className="block text-[12px] text-slate-400 mb-1 font-mono">{f.name}</label>
                            <input
                              value={values[f.name] ?? ''}
                              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                              className="w-full bg-dark-950/70 text-white rounded-lg px-3 py-2 text-[13px] border border-white/10 focus:border-brand-cyan focus:outline-none"
                              placeholder={`Nội dung cho ${f.name}…`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[12.5px] font-bold text-slate-300 mb-2">3. Định dạng xuất</label>
                  <div className="flex gap-2">
                    {(['png', 'jpg', 'mp4'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`px-4 py-1.5 rounded-lg text-[12.5px] font-bold uppercase border transition-colors ${
                          format === f
                            ? 'border-brand-cyan bg-brand-cyan/10 text-white'
                            : 'border-white/10 text-slate-400 hover:border-white/25'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {runError && <p className="text-[12.5px] text-red-300">{runError}</p>}

                <button
                  onClick={handleRun}
                  disabled={!selectedId || running}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang autofill + xuất file… (có thể mất 1–3 phút)
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4" />
                      Chạy Autofill → tạo nháp Content Studio
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
