import type { ReactNode } from 'react'

/**
 * SafeLink — link an toàn cho URL có thể đến từ dữ liệu người dùng
 * (affiliate URL, URL nhập tay...).
 *
 * Chỉ cho phép điều hướng không thể thực thi script: http/https/mailto.
 * Mọi scheme khác (javascript:, data:, vbscript:, ...) render thành text
 * trơ, không click được — chống XSS qua href.
 *
 * Pattern port từ Strix viewer (audit 2026-09-21).
 */
const SAFE_SCHEME = /^(https?|mailto):/i

interface SafeLinkProps {
  href?: string
  children?: ReactNode
  className?: string
  /** Mở tab mới kèm rel bảo vệ tabnabbing. Mặc định true cho link ngoài. */
  external?: boolean
}

export default function SafeLink({ href, children, className, external = true }: SafeLinkProps) {
  if (typeof href === 'string' && SAFE_SCHEME.test(href.trim())) {
    return (
      <a
        href={href}
        className={className}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }
  // URL không an toàn → render text trơ
  return <span className={className}>{children}</span>
}
