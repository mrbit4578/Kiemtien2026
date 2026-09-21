# Security Policy

## Báo lỗi bảo mật

Nếu bạn phát hiện lỗ hổng bảo mật, **không** mở public issue.
Gửi email đến: **security@openremotehub.example** với tiêu đề `[SECURITY]`.

Chúng tôi cam kết phản hồi trong vòng **48 giờ** và vá lỗi trong vòng **90 ngày**.

## Phạm vi

- OAuth flow: CSRF, PKCE bypass, redirect open
- Token leakage qua log, response, URL
- Tenant isolation bypass (IDOR, SQL injection)
- XSS, SSRF, RCE
- Privacy data exposure

## Ngoài phạm vi

- Rate limit thuần túy không dẫn đến data exposure
- Thiếu HSTS header trên môi trường dev
- Brute-force mà không có impact thực tế

## Hall of Fame

Các nhà nghiên cứu được ghi nhận trong file `CONTRIBUTORS.md`.
