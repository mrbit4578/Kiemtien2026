import type { Provider } from '@orh/shared'

export const CURRENT_POLICY_VERSION = '2024-01'  // cập nhật khi policy thay đổi

export interface ConsentRecord {
  id: string
  userId: string
  provider: Provider
  purpose: string
  scopesJson: string[]
  policyVersion: string
  grantedAt: Date
  revokedAt?: Date
  ipHash: string
}

/**
 * Màn hình consent phải hiển thị:
 * - Dữ liệu nào được nhận
 * - Mục đích
 * - Dữ liệu nào KHÔNG thu thập
 * - Thời gian lưu trữ
 * - Cách rút quyền
 *
 * Theo Nghị định 13/2023/NĐ-CP: thông báo 1 lần trước khi xử lý,
 * nội dung phải có mục đích xử lý.
 */
export function buildConsentNotice(provider: Provider, scopes: string[]): string {
  return [
    `Bạn sắp cấp quyền cho OpenRemoteHub kết nối tài khoản ${provider.toUpperCase()}.`,
    `Phạm vi quyền: ${scopes.join(', ')}.`,
    'Chúng tôi KHÔNG lưu mật khẩu, KHÔNG đọc tin nhắn riêng tư.',
    'Bạn có thể rút quyền bất kỳ lúc nào trong Cài đặt > Kết nối.',
    `Chính sách bảo mật áp dụng phiên bản ${CURRENT_POLICY_VERSION}.`,
  ].join('\n')
}

export function isConsentRequired(
  existing: ConsentRecord | undefined,
  newScopes: string[],
): boolean {
  if (!existing || existing.revokedAt) return true
  if (existing.policyVersion !== CURRENT_POLICY_VERSION) return true
  const existingSet = new Set(existing.scopesJson)
  return newScopes.some((s) => !existingSet.has(s))
}
