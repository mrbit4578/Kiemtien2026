# Video brief 06 — 5 nguyên tắc khi giao việc cho AI Agent

- **Nguồn:** `nn-llm-agent-v1`, mục 4 (thiết kế công cụ) + mục 5 (human-in-the-loop) — anchor `[16]` `[11]`
- **Đối tượng:** người đang dựng thử agent (n8n/LangGraph), kỹ thuật viên
- **Góc mới (original-first):** dạng "5 điều sếp dặn trước khi giao việc cho nhân viên mới" — mỗi nguyên tắc là một lời dặn ngắn, có ví dụ mini từ cụm công cụ kho (`get_order`, `get_available_stock`).
- **Hook gợi ý (0–3s):** "Agent của bạn làm sai? 90% là do bạn giao việc chưa rõ — 5 nguyên tắc này sửa được."
- **Dàn ý cảnh:**
  1. Đặt tên công cụ rõ nghĩa, động từ đầu (`get_order`, không đặt `xử_lý_1`)
  2. Viết schema tham số chặt + mô tả khi nào dùng
  3. Lỗi trả về có cấu trúc để agent tự phục hồi
  4. Tách công cụ đọc (tự do) và ghi (phải qua kiểm tra/quyền)
  5. Việc quan trọng (gửi khách hàng, đổi dữ liệu) bắt buộc người duyệt
  6. Kết: công cụ tốt = agent ít sai + ít tốn tiền gọi tool
- **Claim ledger:**
  - "6 nguyên tắc thiết kế tool theo Anthropic" — `[16]` — VERIFIED (brief rút gọn còn 5 ý chính)
  - "Công cụ ghi phải idempotent" — mục 4.1 — VERIFIED
  - "n8n có cơ chế human-in-the-loop cho tool" — `[11]` — VERIFIED
- **Rủi ro / gate:** accuracy thấp; không hướng dẫn chi tiết cấu hình bảo mật production (khóa API, secret manager) — chỉ ở mức nguyên tắc.
- **Thời lượng & format:** 60s, 1080x1920, voiceover + sub burn-in, beat 0.15 + ducking.
