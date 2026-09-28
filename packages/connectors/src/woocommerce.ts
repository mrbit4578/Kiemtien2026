import { OrhError } from '@orh/shared'

/**
 * WooCommerce connector (API-key, KHÔNG OAuth).
 *
 * Dùng WooCommerce REST API v3 để kéo catalog sản phẩm của cửa hàng user vào
 * Kiemtien2026 — phục vụ AI tạo content affiliate / video faceless từ sản phẩm thật,
 * thay vì bịa thông tin sản phẩm.
 *
 * Xác thực: Consumer Key + Consumer Secret qua HTTP Basic Auth (WooCommerce chỉ
 * chấp nhận Basic trên HTTPS — client từ chối URL http để không lộ key).
 *
 * Đây KHÔNG phải Visidea: Visidea là plugin chạy trên chính site WordPress
 * (visual search + recommendations). Connector này đọc catalog qua WC REST API,
 * độc lập với việc site có cài Visidea hay không.
 */

export interface WooStoreCredentials {
  /** VD: https://shopcuaban.com (không có path thừa, không có trailing slash) */
  storeUrl: string
  consumerKey: string
  consumerSecret: string
}

export interface WooProduct {
  id: number
  name: string
  slug: string
  permalink: string
  sku: string
  price: string
  regularPrice: string
  salePrice: string
  onSale: boolean
  purchasable: boolean
  stockStatus: string
  stockQuantity: number | null
  description: string
  shortDescription: string
  categories: Array<{ id: number; name: string; slug: string }>
  images: Array<{ src: string; alt: string }>
  averageRating: string
  ratingCount: number
  totalSales: number
}

export interface WooProductsQuery {
  search?: string
  page?: number
  perPage?: number
  category?: string
  orderby?: 'date' | 'popularity' | 'rating' | 'price' | 'title'
  order?: 'asc' | 'desc'
  onSale?: boolean
  stockStatus?: 'instock' | 'outofstock' | 'onbackorder'
}

const FETCH_TIMEOUT_MS = 15_000

function normalizeStoreUrl(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new OrhError('INVALID_STATE', `URL cửa hàng không hợp lệ: ${trimmed}`)
  }
  if (url.protocol !== 'https:') {
    throw new OrhError(
      'INVALID_STATE',
      'WooCommerce chỉ chấp nhận Consumer Key qua HTTPS. Hãy dùng URL https:// của cửa hàng.',
    )
  }
  if (url.username || url.password) {
    throw new OrhError('INVALID_STATE', 'URL cửa hàng không được chứa username/password.')
  }
  const host = url.hostname.toLowerCase()
  // Chặn SSRF cơ bản: không cho trỏ vào mạng nội bộ / loopback / metadata cloud.
  if (
    host === 'localhost' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    host === '169.254.169.254'
  ) {
    throw new OrhError('INVALID_STATE', 'URL cửa hàng không được trỏ vào địa chỉ nội bộ.')
  }
  return `${url.protocol}//${url.host}`
}

function authHeader(creds: WooStoreCredentials): string {
  return 'Basic ' + Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64')
}

async function wcFetch(
  creds: WooStoreCredentials,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<{ data: any; totalPages: number; total: number }> {
  const base = normalizeStoreUrl(creds.storeUrl)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  const url = `${base}/wp-json/wc/v3${path}${qs.size ? `?${qs}` : ''}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader(creds),
        Accept: 'application/json',
        'User-Agent': 'Kiemtien2026/1.0 (+woocommerce-connector)',
      },
      signal: ctrl.signal,
    })
    if (res.status === 401 || res.status === 403) {
      throw new OrhError(
        'PROVIDER_REAUTH_REQUIRED',
        'Consumer Key/Secret không đúng hoặc thiếu quyền read. Tạo key mới trong WP Admin → WooCommerce → Settings → Advanced → REST API (quyền Read).',
        false,
        'woocommerce',
      )
    }
    if (res.status === 404) {
      throw new OrhError(
        'INVALID_STATE',
        'Không tìm thấy WooCommerce REST API ở URL này. Kiểm tra lại URL cửa hàng (phải là trang chủ site WooCommerce).',
      )
    }
    if (!res.ok) {
      throw new OrhError('TRANSIENT_NETWORK_ERROR', `WooCommerce API lỗi HTTP ${res.status}.`, res.status >= 500, 'woocommerce')
    }
    const data = await res.json()
    return {
      data,
      totalPages: Number(res.headers.get('x-wp-totalpages') || 1),
      total: Number(res.headers.get('x-wp-total') || (Array.isArray(data) ? data.length : 0)),
    }
  } catch (e) {
    if (e instanceof OrhError) throw e
    if ((e as Error).name === 'AbortError') {
      throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Cửa hàng phản hồi quá chậm (>15s). Thử lại sau.', true, 'woocommerce')
    }
    throw new OrhError('TRANSIENT_NETWORK_ERROR', `Không kết nối được tới cửa hàng: ${(e as Error).message}`, true, 'woocommerce')
  } finally {
    clearTimeout(timer)
  }
}

function stripTags(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toWooProduct(p: any): WooProduct {
  return {
    id: p.id,
    name: stripTags(p.name).slice(0, 300),
    slug: p.slug || '',
    permalink: p.permalink || '',
    sku: p.sku || '',
    price: p.price || '',
    regularPrice: p.regular_price || '',
    salePrice: p.sale_price || '',
    onSale: !!p.on_sale,
    purchasable: !!p.purchasable,
    stockStatus: p.stock_status || '',
    stockQuantity: p.stock_quantity ?? null,
    description: stripTags(p.description).slice(0, 2000),
    shortDescription: stripTags(p.short_description).slice(0, 500),
    categories: (p.categories || []).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
    images: (p.images || []).map((i: any) => ({ src: i.src, alt: i.alt || '' })),
    averageRating: p.average_rating || '0',
    ratingCount: p.rating_count || 0,
    totalSales: p.total_sales || 0,
  }
}

export class WooCommerceClient {
  constructor(private readonly creds: WooStoreCredentials) {}

  /** Kiểm tra kết nối: đọc system_status để lấy tên shop + version WC. */
  async testConnection(): Promise<{ storeName: string; version: string; currency: string }> {
    const { data } = await wcFetch(this.creds, '/system_status', { _fields: 'environment' })
    const env = data?.environment || {}
    return {
      storeName: env.site_url || normalizeStoreUrl(this.creds.storeUrl),
      version: env.version || 'unknown',
      currency: env.currency || '',
    }
  }

  async listProducts(query: WooProductsQuery = {}): Promise<{
    products: WooProduct[]
    page: number
    perPage: number
    totalPages: number
    total: number
  }> {
    const perPage = Math.min(Math.max(query.perPage || 20, 1), 100)
    const page = Math.max(query.page || 1, 1)
    const { data, totalPages, total } = await wcFetch(this.creds, '/products', {
      search: query.search,
      page,
      per_page: perPage,
      category: query.category,
      orderby: query.orderby,
      order: query.order,
      on_sale: query.onSale,
      stock_status: query.stockStatus,
      status: 'publish',
    })
    return {
      products: (Array.isArray(data) ? data : []).map(toWooProduct),
      page,
      perPage,
      totalPages,
      total,
    }
  }

  async getProduct(id: number): Promise<WooProduct> {
    if (!Number.isInteger(id) || id <= 0) throw new OrhError('INVALID_STATE', 'ID sản phẩm không hợp lệ.')
    const { data } = await wcFetch(this.creds, `/products/${id}`)
    return toWooProduct(data)
  }

  async listCategories(): Promise<Array<{ id: number; name: string; slug: string; count: number }>> {
    const { data } = await wcFetch(this.creds, '/products/categories', { per_page: 100, hide_empty: true })
    return (Array.isArray(data) ? data : []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: c.count || 0,
    }))
  }
}

/** Manifest tĩnh để UI hiển thị (không phải OAuth provider). */
export const WOOCOMMERCE_MANIFEST = {
  provider: 'woocommerce',
  title: 'WooCommerce',
  description:
    'Kết nối cửa hàng WooCommerce để AI đọc catalog sản phẩm thật: tạo content affiliate, video faceless, caption bán hàng — không bịa thông tin.',
  authKind: 'api_key',
  fields: [
    { key: 'storeUrl', label: 'URL cửa hàng', placeholder: 'https://shopcuaban.com', type: 'url' },
    { key: 'consumerKey', label: 'Consumer Key', placeholder: 'ck_...', type: 'password' },
    { key: 'consumerSecret', label: 'Consumer Secret', placeholder: 'cs_...', type: 'password' },
  ],
  helpText:
    'Tạo key trong WP Admin → WooCommerce → Settings → Advanced → REST API → Add key (quyền Read, user admin). Key chỉ lưu mã hóa trên server.',
} as const
