import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWooProductsTool } from './builtin-tools'

const SAMPLE = {
  connected: true as const,
  storeUrl: 'https://shop.example.com',
  total: 2,
  products: [
    {
      id: 12,
      name: 'Áo thun',
      price: '199000',
      regularPrice: '249000',
      onSale: true,
      permalink: 'https://shop.example.com/sp/ao-thun',
      image: 'https://shop.example.com/a.jpg',
      categories: 'Áo',
      shortDescription: 'Áo thun cotton',
      rating: '4.5',
    },
  ],
}

describe('makeWooProductsTool', () => {
  it('trả danh sách sản phẩm gọn với giá/link/mô tả thật', async () => {
    const tool = makeWooProductsTool(async () => SAMPLE)
    const out = await tool.execute({ keyword: 'áo' }, {} as any)
    assert.match(out, /Áo thun/)
    assert.match(out, /199000/)
    assert.match(out, /https:\/\/shop\.example\.com\/sp\/ao-thun/)
    assert.match(out, /đang sale/)
  })

  it('báo rõ khi chưa kết nối cửa hàng', async () => {
    const tool = makeWooProductsTool(async () => ({ connected: false as const, products: [] }))
    const out = await tool.execute({}, {} as any)
    assert.match(out, /Chưa kết nối cửa hàng WooCommerce/)
    assert.match(out, /Cài đặt → WooCommerce/)
  })

  it('báo khi không tìm thấy sản phẩm', async () => {
    const tool = makeWooProductsTool(async () => ({ ...SAMPLE, products: [], total: 0 }))
    const out = await tool.execute({ keyword: 'xyz' }, {} as any)
    assert.match(out, /Không tìm thấy sản phẩm/)
  })

  it('giới hạn limit trong 1..12', async () => {
    let gotLimit = 0
    const tool = makeWooProductsTool(async (_k, limit) => {
      gotLimit = limit
      return SAMPLE
    })
    await tool.execute({ limit: 99 }, {} as any)
    assert.equal(gotLimit, 12)
    await tool.execute({ limit: -5 }, {} as any)
    assert.equal(gotLimit, 1)
  })
})
