'use client'

import { WooCommerceCard } from '../../../components/WooCommerceCard'

export default function WooCommerceSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">WooCommerce</h1>
        <p className="mt-1 text-sm text-white/60">
          Kết nối cửa hàng WooCommerce của bạn. AI sẽ đọc catalog sản phẩm thật (tên, giá, link, mô tả) để viết
          content affiliate, kịch bản video bán hàng — không còn bịa thông tin sản phẩm.
        </p>
      </div>
      <WooCommerceCard />
    </div>
  )
}
