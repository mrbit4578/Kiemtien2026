/**
 * Kinh tế video MMO — playbook mmo-ai-tiktok-roadmap-v1 chương 05.
 *
 * "Tính hiệu quả thay vì đoán thu nhập": mọi số tiền đều từ sổ quyết toán
 * (commissionReceived), KHÔNG suy tiền từ lượt view. Số trong simulate chỉ
 * là GIẢ ĐỊNH minh họa để thấy điểm hòa vốn.
 *
 * Pure functions — dễ unit test, không phụ thuộc DB/Nest.
 * Đơn vị tiền: VND (số nguyên).
 */

/** 6 cơ chế thu nhập (playbook chương 04). */
export const MONETIZATION_MODELS = [
  { id: 'tiktok_shop_affiliate', label: 'TikTok Shop Affiliate', note: 'Hoa hồng từ đơn được ghi công và đủ điều kiện quyết toán.' },
  { id: 'software_affiliate', label: 'Affiliate phần mềm', note: 'Hoa hồng theo hợp đồng đối tác khi khách đủ điều kiện.' },
  { id: 'digital_product', label: 'Sản phẩm số của bạn', note: 'Bán bộ mẫu Excel, tài liệu, bài học, workflow có hướng dẫn.' },
  { id: 'paid_content', label: 'Nội dung trả phí (Series)', note: 'TikTok Series cho nhà sáng tạo đủ điều kiện — phải xác minh trên tài khoản.' },
  { id: 'ugc_sponsorship', label: 'UGC / tài trợ', note: 'Khách hàng trả phí theo hợp đồng sản xuất hoặc hợp tác.' },
  { id: 'creator_rewards', label: 'Creator Rewards', note: 'Thưởng theo chương trình — chưa xác minh trên tài khoản thì KHÔNG đưa vào dự toán.' },
] as const

export type MonetizationModelId = (typeof MONETIZATION_MODELS)[number]['id']

export function isMonetizationModel(id: string): id is MonetizationModelId {
  return (MONETIZATION_MODELS as readonly { id: string }[]).some((m) => m.id === id)
}

export interface AffiliateSimulationInput {
  views: number
  clickThroughRate: number // 0..1 — tỷ lệ nhấp liên kết
  orderRateAfterClick: number // 0..1 — tỷ lệ đặt đơn sau nhấp
  eligibleRate: number // 0..1 — tỷ lệ đơn đủ điều kiện
  commissionPerOrder: number // VND/đơn hợp lệ
}

export interface AffiliateSimulation {
  clicks: number
  orders: number
  eligibleOrders: number
  commission: number // VND mô phỏng
}

/**
 * Mô phỏng hoa hồng affiliate:
 * views × CTR × orderRate × eligibleRate × commission/đơn.
 * [Speculation] Số GIẢ ĐỊNH — chỉ dùng để thấy khi nào chi phí > hoa hồng.
 */
export function simulateAffiliateCommission(input: AffiliateSimulationInput): AffiliateSimulation {
  const clicks = Math.floor(input.views * input.clickThroughRate)
  const orders = Math.floor(clicks * input.orderRateAfterClick)
  const eligibleOrders = Math.floor(orders * input.eligibleRate)
  const commission = eligibleOrders * input.commissionPerOrder
  return { clicks, orders, eligibleOrders, commission }
}

/**
 * Số đơn hợp lệ tối thiểu để bù chi phí tiền mặt.
 * Trả về null khi commissionPerOrder ≤ 0 (không thể hòa vốn).
 */
export function breakevenOrders(costCash: number, commissionPerOrder: number): number | null {
  if (commissionPerOrder <= 0) return null
  if (costCash <= 0) return 0
  return Math.ceil(costCash / commissionPerOrder)
}

export interface EconomicsInput {
  costCash: number
  hoursWorked: number
  views: number
  clicks: number
  orders: number
  eligibleOrders: number
  commissionReceived: number // VND thực nhận từ sổ quyết toán
}

export interface EconomicsSummary {
  /** Phần dư = hoa hồng thực nhận − chi phí (trước thuế và công). */
  profit: number
  /** Tiền thực nhận / 1.000 lượt xem. null khi chưa có view. */
  revenuePer1kViews: number | null
  /** Chi phí / đơn đủ điều kiện. null khi chưa có đơn. */
  costPerEligibleOrder: number | null
  /** Giờ vận hành / đơn đủ điều kiện — thước đo "thụ động". null khi chưa có đơn. */
  hoursPerOrder: number | null
  /** Tỷ lệ đơn đủ điều kiện / đơn đặt. */
  eligibleRate: number | null
  /** Tỷ lệ nhấp / view. */
  clickThroughRate: number | null
  /** Tỷ lệ đặt đơn / nhấp. */
  orderRateAfterClick: number | null
}

const round2 = (x: number) => Math.round(x * 100) / 100
const div = (a: number, b: number): number | null => (b > 0 ? round2(a / b) : null)

/**
 * Tóm tắt hiệu quả 1 video từ số liệu THẬT (quyết toán + đo lường).
 * Lượt view/follow chỉ là chỉ số phân phối — không dùng để suy ra tiền.
 */
export function summarizeEconomics(e: EconomicsInput): EconomicsSummary {
  return {
    profit: e.commissionReceived - e.costCash,
    revenuePer1kViews: e.views > 0 ? round2((e.commissionReceived / e.views) * 1000) : null,
    costPerEligibleOrder: div(e.costCash, e.eligibleOrders),
    hoursPerOrder: div(e.hoursWorked, e.eligibleOrders),
    eligibleRate: div(e.eligibleOrders, e.orders),
    clickThroughRate: div(e.clicks, e.views),
    orderRateAfterClick: div(e.orders, e.clicks),
  }
}
