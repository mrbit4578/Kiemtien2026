/** @type {import('next').NextConfig} */
// Content-Security-Policy: khóa script/style chỉ từ first-party.
// script-src giữ 'unsafe-inline' vì Next.js inject inline script khi hydrate;
// lớp chống XSS chính vẫn là escape HTML trước khi render (đã làm ở các page).
// connect-src 'self' https: cho phép web gọi API cross-origin (Render).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  // Token KHÔNG được phép xuất hiện ở frontend
  experimental: {
    serverComponentsExternalPackages: ['@orh/crypto'],
  },
}

module.exports = nextConfig
