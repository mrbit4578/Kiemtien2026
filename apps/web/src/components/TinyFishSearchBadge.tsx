'use client'

import { useRouter } from 'next/navigation'
import { useAiConnections } from '../lib/hooks'

/**
 * Badge trạng thái nguồn tìm kiếm web của agent.
 * Hiện khi workspace đã kết nối key TinyFish ở AI Pro (Cài đặt → AI Pro):
 * tool web_search/fetch_url của agent đang dùng TinyFish Search & Fetch API.
 * Bấm vào để sang trang AI Pro quản lý key.
 *
 * Dùng chung cho: AI Copilot, AI Chat Pro, trang Tổng quan.
 */
export function TinyFishSearchBadge() {
  const router = useRouter()
  const { connections } = useAiConnections()

  const active = connections.some((c) => c.provider === 'tinyfish' && c.status === 'active')
  if (!active) return null

  return (
    <button
      type="button"
      onClick={() => router.push('/settings/ai')}
      className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-teal-400/15 text-teal-300 border border-teal-400/30 whitespace-nowrap hover:bg-teal-400/25 transition-colors cursor-pointer"
      title="Tool web_search/fetch_url của agent đang dùng TinyFish Search & Fetch API — bấm để quản lý key ở AI Pro"
    >
      🔍 Web search: TinyFish
    </button>
  )
}
