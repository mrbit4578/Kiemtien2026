'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  ShieldCheck,
  X,
  RefreshCw,
} from 'lucide-react'
import { useAiProviders, useAiConnections } from '../../../lib/hooks'
import SafeLink from '../../../components/SafeLink'
import { ApiError } from '../../../lib/api'
import type { AiProviderMeta } from '../../../lib/types'

const PROVIDER_ACCENT: Record<string, string> = {
  gemini: 'from-blue-500 to-cyan-400',
  openai: 'from-emerald-500 to-teal-400',
  xai: 'from-slate-400 to-slate-600',
  anthropic: 'from-orange-500 to-amber-400',
  deepseek: 'from-violet-500 to-purple-400',
}

function KeyModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: AiProviderMeta
  onClose: () => void
  onSaved: () => void
}) {
  const { connect } = useAiConnections()
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError(null)
    if (apiKey.trim().length < 8) {
      setError('API key quá ngắn. Hãy kiểm tra lại key bạn đã copy.')
      return
    }
    setSaving(true)
    try {
      // Backend validate key bằng 1 call nhẹ rồi mới mã hóa & lưu.
      // Key KHÔNG BAO GIỜ được log hay trả về frontend.
      await connect(provider.id, apiKey.trim())
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra. Hãy thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass-panel rounded-2xl border border-white/15 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-brand-emerald" />
              Kết nối {provider.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Dán API key của bạn — key sẽ được kiểm tra rồi mã hóa AES-256-GCM trước khi lưu.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <SafeLink
          href={provider.keyUrl}
          className="flex items-center gap-2 text-xs text-brand-cyan hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Lấy API key tại trang chính thức của {provider.name}
        </SafeLink>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-300 mb-1.5 block">API key</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Dán API key vào đây…"
              autoComplete="off"
              spellCheck={false}
              className="w-full pr-11 pl-4 py-3 rounded-xl bg-dark-950/70 border border-white/10 text-white text-sm font-mono placeholder:text-slate-600 placeholder:font-sans focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/30"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label={show ? 'Ẩn key' : 'Hiện key'}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Key chỉ gửi 1 lần để kiểm tra, sau đó lưu dạng mã hóa — không bao giờ hiển thị lại.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-semibold hover:bg-white/10"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{saving ? 'Đang kiểm tra…' : 'Kiểm tra & Lưu'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AiSettingsPage() {
  const { providers, loading: loadingProviders } = useAiProviders()
  const { connections, loading: loadingConns, remove, refresh } = useAiConnections()
  const [modalProvider, setModalProvider] = useState<AiProviderMeta | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const connByProvider = new Map(connections.map((c) => [c.provider, c]))

  const handleDelete = async (providerId: string, providerName: string) => {
    if (!confirm(`Xóa API key ${providerName}? Bạn sẽ cần nhập lại key để dùng AI Pro.`)) return
    setDeleting(providerId)
    try {
      await remove(providerId)
      setNotice(`Đã xóa key ${providerName}.`)
    } catch {
      setNotice(null)
    } finally {
      setDeleting(null)
    }
  }

  const loading = loadingProviders || loadingConns

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-violet" />
            Kết nối AI Pro
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dùng API key <span className="text-slate-200 font-semibold">của chính bạn</span> (gói Pro đã
            đăng ký) cho Gemini, ChatGPT, Grok, Claude và DeepSeek.
          </p>
        </div>
        <button
          onClick={() => { setNotice(null); refresh() }}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-bold flex items-center gap-2 hover:bg-white/10"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-emerald/10 border border-brand-emerald/30 text-brand-emerald text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Đang tải…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((p) => {
            const conn = connByProvider.get(p.id)
            const accent = PROVIDER_ACCENT[p.id] ?? 'from-brand-cyan to-brand-violet'
            return (
              <div key={p.id} className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${accent} flex items-center justify-center`}>
                      <Sparkles className="w-5 h-5 text-dark-950" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white">{p.name}</h3>
                      <SafeLink
                        href={p.keyUrl}
                        className="text-[11px] text-brand-cyan hover:underline flex items-center gap-1"
                      >
                        Lấy API key <ExternalLink className="w-3 h-3" />
                      </SafeLink>
                    </div>
                  </div>
                  {conn ? (
                    conn.status === 'active' ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-emerald/15 text-brand-emerald border border-brand-emerald/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                        <XCircle className="w-3.5 h-3.5" /> Key lỗi
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
                      Chưa kết nối
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>

                {conn && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-dark-950/60 border border-white/5 rounded-xl px-3 py-2">
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    <span>{conn.keyHint}</span>
                    {conn.validatedAt && (
                      <span className="ml-auto text-[10px] text-slate-500">
                        Kiểm tra: {new Date(conn.validatedAt).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setModalProvider(p)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-emerald to-brand-cyan text-dark-950 text-xs font-bold hover:opacity-95"
                  >
                    {conn ? 'Đổi key' : 'Kết nối key'}
                  </button>
                  {conn && (
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deleting === p.id}
                      className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5 hover:bg-red-500/20 disabled:opacity-60"
                    >
                      {deleting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5 border border-white/10 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-emerald shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
          <p className="font-bold text-white">Cam kết bảo mật API key của bạn</p>
          <p>• Key được kiểm tra 1 lần bằng 1 call nhẹ, sau đó <strong>mã hóa AES-256-GCM</strong> trước khi lưu — không lưu plaintext.</p>
          <p>• Backend <strong>không bao giờ</strong> trả key về trình duyệt, không ghi key vào log hay audit.</p>
          <p>• Key chỉ được giải mã trong bộ nhớ server tại thời điểm gọi API provider.</p>
        </div>
      </div>

      <div className="text-center">
        <Link href="/ai-chat" className="text-sm text-brand-emerald font-bold hover:underline">
          → Mở AI Chat Pro với các key đã kết nối
        </Link>
      </div>

      {modalProvider && (
        <KeyModal
          provider={modalProvider}
          onClose={() => setModalProvider(null)}
          onSaved={() => setNotice(`Đã kết nối ${modalProvider.name} thành công.`)}
        />
      )}
    </div>
  )
}
