'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

type Template = { id: string; title: string; thumbnailUrl?: string }
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
        setTemplates(d.templates ?? [])
        if ((d.templates ?? []).length === 1) setSelectedId(d.templates[0].id)
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
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-200">
                Không tìm thấy Brand Template nào trong tài khoản Canva của bạn. Autofill yêu cầu Brand
                Template (theo tài liệu Canva là tính năng Enterprise) — hãy tạo mẫu trong Canva rồi thử lại.
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
