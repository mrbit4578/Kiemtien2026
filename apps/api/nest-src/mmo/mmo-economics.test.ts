import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  simulateAffiliateCommission,
  breakevenOrders,
  summarizeEconomics,
  isMonetizationModel,
  MONETIZATION_MODELS,
} from './mmo-economics'

describe('mmo-economics — playbook chương 05', () => {
  it('mô phỏng affiliate đúng công thức views × CTR × orderRate × eligibleRate × commission', () => {
    // Bảng giả định "Giữa" trong playbook: 100k view, CTR 1%, đặt đơn 2%, đủ ĐK 80%, 40k/đơn
    const r = simulateAffiliateCommission({
      views: 100_000,
      clickThroughRate: 0.01,
      orderRateAfterClick: 0.02,
      eligibleRate: 0.8,
      commissionPerOrder: 40_000,
    })
    assert.equal(r.clicks, 1000)
    assert.equal(r.orders, 20)
    assert.equal(r.eligibleOrders, 16)
    assert.equal(r.commission, 640_000)
  })

  it('mức Thấp/Cao trong playbook', () => {
    const low = simulateAffiliateCommission({
      views: 100_000, clickThroughRate: 0.005, orderRateAfterClick: 0.01, eligibleRate: 0.8, commissionPerOrder: 40_000,
    })
    assert.equal(low.commission, 160_000)
    const high = simulateAffiliateCommission({
      views: 100_000, clickThroughRate: 0.02, orderRateAfterClick: 0.03, eligibleRate: 0.8, commissionPerOrder: 40_000,
    })
    assert.equal(high.commission, 1_920_000)
  })

  it('điểm hòa vốn: cần ≥23 đơn hợp lệ @40k để bù 900k chi phí', () => {
    assert.equal(breakevenOrders(900_000, 40_000), 23)
    assert.equal(breakevenOrders(0, 40_000), 0)
    assert.equal(breakevenOrders(900_000, 0), null)
  })

  it('summarize: lợi nhuận, tiền/1k view, chi phí/đơn, giờ/đơn', () => {
    const s = summarizeEconomics({
      costCash: 900_000,
      hoursWorked: 12,
      views: 100_000,
      clicks: 1000,
      orders: 20,
      eligibleOrders: 16,
      commissionReceived: 640_000,
    })
    assert.equal(s.profit, -260_000)
    assert.equal(s.revenuePer1kViews, 6400)
    assert.equal(s.costPerEligibleOrder, 56250)
    assert.equal(s.hoursPerOrder, 0.75)
    assert.equal(s.eligibleRate, 0.8)
    assert.equal(s.clickThroughRate, 0.01)
    assert.equal(s.orderRateAfterClick, 0.02)
  })

  it('chia cho 0 → null, không NaN/Infinity', () => {
    const s = summarizeEconomics({
      costCash: 500_000, hoursWorked: 5, views: 0, clicks: 0, orders: 0, eligibleOrders: 0, commissionReceived: 0,
    })
    assert.equal(s.profit, -500_000)
    assert.equal(s.revenuePer1kViews, null)
    assert.equal(s.costPerEligibleOrder, null)
    assert.equal(s.hoursPerOrder, null)
    assert.equal(s.eligibleRate, null)
  })

  it('6 cơ chế thu nhập hợp lệ', () => {
    assert.equal(MONETIZATION_MODELS.length, 6)
    assert.ok(isMonetizationModel('tiktok_shop_affiliate'))
    assert.ok(isMonetizationModel('creator_rewards'))
    assert.ok(!isMonetizationModel('ban_hang_ao'))
  })
})
