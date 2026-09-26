import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { WooCommerceClient } from './woocommerce'

const CREDS = { storeUrl: 'https://shop.example.com', consumerKey: 'ck_test', consumerSecret: 'cs_test' }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetch(jsonBody: unknown, opts: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) {
  const { ok = true, status = 200, headers = {} } = opts
  globalThis.fetch = (async (url: any, init: any) => {
    ;(globalThis as any).__lastWooReq = { url: String(url), init }
    return {
      ok,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => jsonBody,
    } as unknown as Response
  }) as typeof fetch
}

const lastReq = () => (globalThis as any).__lastWooReq as { url: string; init: any }

describe('WooCommerceClient — validate URL', () => {
  it('từ chối URL http (Basic auth chỉ an toàn trên HTTPS)', async () => {
    const c = new WooCommerceClient({ ...CREDS, storeUrl: 'http://shop.example.com' })
    await assert.rejects(() => c.listProducts(), /HTTPS/)
  })
  it('từ chối URL trỏ vào mạng nội bộ (SSRF guard)', async () => {
    for (const u of ['https://localhost/', 'https://127.0.0.1/', 'https://192.168.1.5/', 'https://169.254.169.254/']) {
      const c = new WooCommerceClient({ ...CREDS, storeUrl: u })
      await assert.rejects(() => c.listProducts(), /nội bộ/, u)
    }
  })
  it('từ chối URL chứa userinfo', async () => {
    const c = new WooCommerceClient({ ...CREDS, storeUrl: 'https://user:pass@shop.example.com' })
    await assert.rejects(() => c.listProducts(), /username\/password/)
  })
  it('chuẩn hóa trailing slash', async () => {
    mockFetch([], {})
    const c = new WooCommerceClient({ ...CREDS, storeUrl: 'https://shop.example.com///' })
    await c.listProducts()
    assert.ok(lastReq().url.startsWith('https://shop.example.com/wp-json/wc/v3/products'))
  })
})

describe('WooCommerceClient — auth & mapping', () => {
  it('gửi Basic auth = base64(ck:cs)', async () => {
    mockFetch([], {})
    await new WooCommerceClient(CREDS).listProducts()
    const h = lastReq().init.headers.Authorization as string
    assert.equal(h, 'Basic ' + Buffer.from('ck_test:cs_test').toString('base64'))
  })
  it('401 → lỗi WOO_AUTH_FAILED với hướng dẫn tạo key', async () => {
    mockFetch({ code: 'woocommerce_rest_authentication_error' }, { ok: false, status: 401 })
    await assert.rejects(
      () => new WooCommerceClient(CREDS).testConnection(),
      /Consumer Key\/Secret không đúng/,
    )
  })
  it('404 → gợi ý kiểm tra URL cửa hàng', async () => {
    mockFetch({}, { ok: false, status: 404 })
    await assert.rejects(() => new WooCommerceClient(CREDS).listProducts(), /REST API/)
  })
  it('map đúng field sản phẩm + đọc header phân trang', async () => {
    mockFetch(
      [
        {
          id: 12,
          name: '<b>Áo thun</b>',
          slug: 'ao-thun',
          permalink: 'https://shop.example.com/sp/ao-thun',
          sku: 'AT-01',
          price: '199000',
          regular_price: '249000',
          sale_price: '199000',
          on_sale: true,
          purchasable: true,
          stock_status: 'instock',
          stock_quantity: 50,
          description: '<p>Mô tả</p>',
          short_description: 'Ngắn',
          categories: [{ id: 3, name: 'Áo', slug: 'ao' }],
          images: [{ src: 'https://shop.example.com/a.jpg', alt: 'Áo' }],
          average_rating: '4.5',
          rating_count: 10,
          total_sales: 7,
        },
      ],
      { headers: { 'x-wp-totalpages': '5', 'x-wp-total': '95' } },
    )
    const r = await new WooCommerceClient(CREDS).listProducts({ search: 'áo', perPage: 20 })
    assert.equal(r.total, 95)
    assert.equal(r.totalPages, 5)
    const p = r.products[0]
    assert.equal(p.id, 12)
    assert.equal(p.name, 'Áo thun') // đã strip tags
    assert.equal(p.shortDescription, 'Ngắn')
    assert.equal(p.categories[0].name, 'Áo')
    assert.ok(lastReq().url.includes('search=%C3%A1o'))
  })
  it('testConnection đọc version từ system_status', async () => {
    mockFetch({ environment: { version: '9.1.2', site_url: 'https://shop.example.com', currency: 'VND' } })
    const r = await new WooCommerceClient(CREDS).testConnection()
    assert.equal(r.version, '9.1.2')
    assert.equal(r.currency, 'VND')
  })
  it('getProduct từ chối id không hợp lệ', async () => {
    await assert.rejects(() => new WooCommerceClient(CREDS).getProduct(0), /không hợp lệ/)
    await assert.rejects(() => new WooCommerceClient(CREDS).getProduct(-3), /không hợp lệ/)
  })
})
