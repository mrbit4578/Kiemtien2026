'use client'

import React, { useEffect, useState } from 'react'
import {
  ShieldCheck,
  Lock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  History,
  FileKey,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useConnections } from '../lib/hooks'
import { api } from '../lib/api'
import type { ApiConnection, ApiProvider } from '../lib/types'

export type ProviderStatus = 'connected' | 'not_connected' | 'reauth_required'

/** Metadata tĩnh của từng provider — trạng thái thật lấy từ GET /connections */
interface ProviderMeta {
  id: ApiProvider
  label: string
  description: string
  scopes: string[]
  encryption: string
}

const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: 'google',
    label: 'Google & YouTube Creator',
    description: 'Xác thực định danh và theo dõi chỉ số video YouTube Shorts.',
    scopes: ['openid', 'email', 'youtube.readonly'],
    encryption: 'AES-256-GCM Envelope',
  },
  {
    id: 'instagram',
    label: 'Instagram Professional',
    description: 'Lên lịch Reels và tự động lấy số liệu tương tác bài viết.',
    scopes: ['instagram_basic', 'instagram_content_publish'],
    encryption: 'AES-256-GCM Envelope',
  },
  {
    id: 'tiktok',
    label: 'TikTok Login Kit & Creator',
    description: 'Đăng video lên kênh TikTok (Chế độ Private review an toàn).',
    scopes: ['user.info.basic', 'video.upload'],
    encryption: 'AES-256-GCM Envelope',
  },
  {
    id: 'facebook',
    label: 'Meta Business & Fanpage',
    description: 'Quản lý bài đăng trang cộng đồng và liên kết Bio Link.',
    scopes: ['pages_show_list', 'pages_read_engagement'],
    encryption: 'AES-256-GCM Envelope',
  },
  {
    id: 'github',
    label: 'GitHub Developer',
    description: 'Đăng nhập nhà phát triển mã nguồn mở và đóng góp dự án.',
    scopes: ['read:user'],
    encryption: 'AES-256-GCM Envelope',
  },
]

function toUiStatus(conn?: ApiConnection): ProviderStatus {
  if (!conn) return 'not_connected'
  if (conn.status === 'active') return 'connected'
  if (conn.status === 'reauth_required') return 'reauth_required'
  return 'not_connected'
}

function formatDateTime(iso: string): string {
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

export function ConnectionsVault() {
  const { connections, loading, error, unauthorized, refresh, revoke, connect } =
    useConnections()
  const [actionLogs, setActionLogs] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const byProvider = new Map<string, ApiConnection>()
  for (const c of connections) {
    if (!byProvider.has(c.provider)) byProvider.set(c.provider, c)
  }

  const addLog = (log: string) => {
    const time = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    setActionLogs((prev) => [`[${time}] ${log}`, ...prev].slice(0, 30))
  }

  // OAuth callback từ backend redirect về /settings/connections?connected=<provider>
  // Đọc query từ window (tránh useSearchParams để không cần Suspense boundary khi build).
  useEffect(() => {
    const connected = new URLSearchParams(window.location.search).get('connected')
    if (connected) {
      addLog(`✅ OAuth thành công: ${connected} đã được kết nối và lưu an toàn.`)
      refresh()
      // Xóa query param để không log trùng khi refresh trang
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = (provider: ApiProvider) => {
    addLog(`🔐 Bắt đầu OAuth cho ${provider} — chuyển sang backend...`)
    connect(provider)
  }

  const handleRevoke = async (conn: ApiConnection, label: string) => {
    if (!window.confirm(`Rút quyền truy cập của ${label}? Token sẽ bị hủy ở cả provider và hệ thống.`)) {
      return
    }
    setBusyId(conn.id)
    try {
      await revoke(conn.id)
      addLog(`🗑️ Đã rút quyền ${label} (revoke ở provider + xóa token trong DB).`)
    } catch (err) {
      addLog(`❌ Rút quyền ${label} thất bại: ${err instanceof Error ? err.message : 'lỗi không xác định'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-br from-brand-emerald to-brand-cyan text-dark-950 shadow-glow-emerald">
              <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-white">Trạm Kết Nối & Két Bảo Mật (OAuth Vault)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kế thừa nguyên tắc Data Sovereignty của WeKnora: 100% Token được mã hóa AES-256-GCM, không lưu mật khẩu
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-lg bg-dark-900 border border-white/10 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-brand-emerald" />
            <span className="text-slate-300">Envelope Encryption:</span>
            <strong className="text-brand-emerald">AES-256-GCM</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-dark-900 border border-white/10 flex items-center gap-2">
            {unauthorized || error ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-brand-amber" />
                <span className="text-slate-300">API: chưa kết nối</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-brand-emerald" />
                <span className="text-slate-300">API: trực tiếp</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Safety Manifesto Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl glass-panel border border-white/10 space-y-1">
          <div className="flex items-center gap-2 text-brand-emerald text-xs font-bold">
            <Lock className="w-4 h-4" /> Không Lưu Mật Khẩu
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hệ thống chỉ giao tiếp qua giao thức OAuth 2.0 PKCE. Mật khẩu mạng xã hội của bạn hoàn toàn không được gửi qua máy chủ.
          </p>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-white/10 space-y-1">
          <div className="flex items-center gap-2 text-brand-cyan text-xs font-bold">
            <FileKey className="w-4 h-4" /> Phân Quyền Tối Thiểu
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Chỉ yêu cầu đúng các scope cần thiết (Least Privilege Scope) để đọc báo cáo hoặc lên lịch bài viết đã duyệt.
          </p>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-white/10 space-y-1">
          <div className="flex items-center gap-2 text-brand-violet text-xs font-bold">
            <History className="w-4 h-4" /> Thu Hồi Quyền 1-Chạm
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Bất kỳ lúc nào bạn cũng có thể bấm "Rút Quyền", hệ thống sẽ lập tức hủy mã token và xóa bỏ khỏi database.
          </p>
        </div>
      </div>

      {/* Providers Cards — trạng thái thật từ GET /connections */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>Danh Sách Nền Tảng Hỗ Trợ</span>
          {loading && <span className="text-xs text-slate-400 font-normal">Đang tải từ API...</span>}
        </h3>

        {error && (
          <div className="p-4 rounded-xl bg-brand-amber/10 border border-brand-amber/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <strong className="text-white">Không lấy được danh sách kết nối:</strong> {error}
              <div className="mt-1 text-slate-400">
                Kiểm tra backend có đang chạy tại <span className="font-mono">{api.oauthStartUrl('').replace('/auth//start', '')}</span> và biến NEXT_PUBLIC_API_URL.
              </div>
            </div>
          </div>
        )}

        {unauthorized && !loading && (
          <div className="p-4 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-brand-cyan shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <strong className="text-white">Chưa có phiên làm việc.</strong> Hãy bấm "Kết Nối An Toàn" ở bất kỳ nền tảng nào để bắt đầu OAuth — backend sẽ tạo workspace session cho bạn.
            </div>
          </div>
        )}

        {PROVIDER_CATALOG.map((p) => {
          const conn = byProvider.get(p.id)
          const status = toUiStatus(conn)
          const isConnected = status === 'connected'
          const isReauth = status === 'reauth_required'
          const busy = busyId === conn?.id

          return (
            <div
              key={p.id}
              className={`glass-panel rounded-xl p-5 border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                isConnected ? 'border-brand-emerald/30 bg-dark-900/80' : 'border-white/10'
              }`}
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-white">{p.label}</h4>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded font-mono ${
                      isConnected
                        ? 'bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30'
                        : isReauth
                        ? 'bg-brand-amber/20 text-brand-amber border border-brand-amber/30'
                        : 'bg-dark-850 text-slate-400 border border-white/10'
                    }`}
                  >
                    {isConnected ? 'ĐÃ KẾT NỐI' : isReauth ? 'CẦN XÁC THỰC LẠI' : 'CHƯA KẾT NỐI'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{p.description}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 font-mono flex-wrap">
                  <span>Scopes: <strong className="text-slate-200">{(conn?.scopesJson ?? p.scopes).join(', ')}</strong></span>
                  <span>•</span>
                  <span>Mã hóa: <strong className="text-brand-emerald">{p.encryption}</strong></span>
                  {conn && (
                    <>
                      <span>•</span>
                      <span>Kết nối: {formatDateTime(conn.createdAt)}</span>
                    </>
                  )}
                  {conn?.lastError && (
                    <>
                      <span>•</span>
                      <span className="text-red-300">Lỗi: {conn.lastError}</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                {isConnected && conn ? (
                  <button
                    onClick={() => handleRevoke(conn, p.label)}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{busy ? 'Đang xử lý...' : 'Rút Quyền (Revoke)'}</span>
                  </button>
                ) : isReauth ? (
                  <button
                    onClick={() => handleConnect(p.id)}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-brand-amber text-dark-950 hover:opacity-90"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Xác Thực Lại</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(p.id)}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-brand-emerald text-dark-950 hover:opacity-90 shadow-glow-emerald"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Kết Nối An Toàn</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Audit Log Panel */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4 text-brand-cyan" />
            Nhật Ký Thao Tác
          </h4>
          <span className="text-[10px] text-brand-emerald font-mono flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ghi tại UI
          </span>
        </div>

        {/* TODO: backend đã ghi audit log vào DB (AuditLogService) nhưng chưa có
            endpoint đọc (VD: GET /audit). Khi có endpoint, thay panel này bằng
            dữ liệu thật từ API thay vì log thao tác phía client. */}
        <div className="p-3.5 rounded-xl bg-dark-950 border border-white/5 font-mono text-[11px] text-slate-300 space-y-1.5 max-h-40 overflow-y-auto">
          {actionLogs.length === 0 ? (
            <div className="flex items-start gap-2 text-slate-500">
              <span>›</span>
              <span>Chưa có thao tác nào trong phiên này. Nhật ký kiểm toán đầy đủ được backend lưu bất biến trong DB.</span>
            </div>
          ) : (
            actionLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-slate-600">›</span>
                <span>{log}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
