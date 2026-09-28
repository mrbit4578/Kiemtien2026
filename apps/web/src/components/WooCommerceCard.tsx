'use client'

import React, { useState } from 'react'
import {
  Store,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Package,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  useWooStores,
  connectWooStore,
  testWooStore,
  disconnectWooStore,
  listWooProducts,
} from '../lib/hooks'
import { ApiError } from '../lib/api'
import type { WooStore, WooProductList } from '../lib/types'

function toMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Lỗi không xác định.'
}

export function WooCommerceCard() {
  const { stores, loading, error, refresh } = useWooStores()
  const [showForm, setShowForm] = useState(false)
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Xem sản phẩm
  const [viewStore, setViewStore] = useState<WooStore | null>(null)
  const [products, setProducts] = useState<WooProductList | null>(null)
  const [prodLoading, setProdLoading] = useState(false)
  const [prodError, setProdError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const loadProducts = async (store: WooStore, p = 1, q = search) => {
    setProdLoading(true)
    setProdError(null)
    try {
      setProducts(await listWooProducts(store.id, { search: q || undefined, page: p, perPage: 10 }))
      setPage(p)
    } catch (err) {
      setProdError(toMessage(err))
    } finally {
      setProdLoading(false)
    }
  }

  const openProducts = (store: WooStore) => {
    setViewStore(store)
    setSearch('')
    setProducts(null)
    loadProducts(store, 1, '')
  }

  const handleConnect = async () => {
    setFormError(null)
    if (!storeUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()) {
      setFormError('Điền đầy đủ URL cửa hàng, Consumer Key và Consumer Secret.')
      return
    }
    setBusy(true)
    try {
      await connectWooStore({ storeUrl: storeUrl.trim(), consumerKey: consumerKey.trim(), consumerSecret: consumerSecret.trim() })
      setShowForm(false)
      setStoreUrl('')
      setConsumerKey('')
      setConsumerSecret('')
      await refresh()
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      await testWooStore(id)
      await refresh()
    } catch {
      await refresh()
    } finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (store: WooStore) => {
    if (!window.confirm(`Ngắt kết nối cửa hàng ${store.storeUrl}? Key mã hóa sẽ bị xóa khỏi server.`)) return
    setDeletingId(store.id)
    try {
      await disconnectWooStore(store.id)
      if (viewStore?.id === store.id) setViewStore(null)
      await refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-400">
            <Store className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Cửa hàng WooCommerce</h2>
            <p className="text-sm text-white/60">
              AI đọc catalog sản phẩm thật để viết content affiliate, kịch bản video — không bịa thông tin.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          {showForm ? 'Đóng' : '+ Kết nối cửa hàng'}
        </button>
      </div>

      {showForm && (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">URL cửa hàng (https)</label>
            <input
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https://shopcuaban.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-violet-400"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/80">Consumer Key</label>
              <input
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                placeholder="ck_..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-white placeholder-white/30 outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/80">Consumer Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                  placeholder="cs_..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 font-mono text-white placeholder-white/30 outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-white/50">
            Tạo key trong WP Admin → WooCommerce → Settings → Advanced → REST API → Add key (quyền <b>Read</b>).
            Key chỉ gửi 1 chiều lên server và lưu mã hóa — không bao giờ hiển thị lại.
          </p>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <button
            onClick={handleConnect}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Kết nối & kiểm tra
          </button>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading && <p className="text-sm text-white/50">Đang tải...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && stores.length === 0 && (
          <p className="text-sm text-white/50">
            Chưa kết nối cửa hàng nào. Kết nối xong, AI (chat/agent) sẽ dùng được tool <span className="font-mono text-violet-300">woo_products</span> để
            tìm sản phẩm thật khi viết content bán hàng.
          </p>
        )}
        {stores.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                {s.status === 'connected' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-semibold text-white">{s.storeName || s.storeUrl}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-white/50">{s.storeUrl}</p>
              <p className="mt-1 text-xs text-white/50">
                {s.productCount} sản phẩm{s.currency ? ` · ${s.currency}` : ''}{s.wcVersion ? ` · WC ${s.wcVersion}` : ''}
                {s.status === 'error' && s.lastError && <span className="text-red-400"> · {s.lastError}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openProducts(s)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                <Package className="h-3.5 w-3.5" /> Sản phẩm
              </button>
              <button
                onClick={() => handleTest(s.id)}
                disabled={testingId === s.id}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {testingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Kiểm tra
              </button>
              <button
                onClick={() => handleDelete(s)}
                disabled={deletingId === s.id}
                className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Ngắt
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewStore && (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">Sản phẩm — {viewStore.storeUrl}</h3>
            <button onClick={() => setViewStore(null)} className="text-sm text-white/50 hover:text-white">Đóng</button>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadProducts(viewStore, 1)}
                placeholder="Tìm sản phẩm..."
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-white placeholder-white/30 outline-none focus:border-violet-400"
              />
            </div>
            <button
              onClick={() => loadProducts(viewStore, 1)}
              disabled={prodLoading}
              className="rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
            </button>
          </div>
          {prodError && <p className="mt-3 text-sm text-red-400">{prodError}</p>}
          {products && (
            <>
              <div className="mt-3 space-y-2">
                {products.products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0].src} alt={p.images[0].alt} className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                        <Package className="h-5 w-5 text-white/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs text-white/50">
                        {p.price} {p.onSale && <span className="text-emerald-400">(sale)</span>}
                        {p.categories.length > 0 && ` · ${p.categories.map((c) => c.name).join(', ')}`}
                      </p>
                    </div>
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
                {products.products.length === 0 && <p className="text-sm text-white/50">Không có sản phẩm.</p>}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-white/50">
                <span>Trang {products.page}/{products.totalPages} · {products.total} sản phẩm</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1 || prodLoading}
                    onClick={() => loadProducts(viewStore, page - 1)}
                    className="rounded-lg border border-white/10 p-1.5 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page >= products.totalPages || prodLoading}
                    onClick={() => loadProducts(viewStore, page + 1)}
                    className="rounded-lg border border-white/10 p-1.5 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
