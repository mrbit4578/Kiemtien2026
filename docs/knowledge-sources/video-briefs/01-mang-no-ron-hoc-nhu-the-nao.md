# Video brief 01 — Mạng nơ-ron học như thế nào?

- **Nguồn:** `nn-knowledge-map-v1`, mục 2 (cơ chế nơ-ron, vòng lặp huấn luyện) — anchor `[41]` `[42]` `[44]`
- **Đối tượng:** học sinh, sinh viên mới tiếp cận AI
- **Góc mới (original-first):** không giảng công thức khô — kể bằng ẩn dụ "nếm món ăn, điều chỉnh gia vị": forward pass = nếm thử, loss = độ mặn lệch, backprop = tìm xem gia vị nào sai, optimizer = chỉnh lại. Toàn bộ ví dụ và lời dẫn tự viết.
- **Hook gợi ý (0–3s):** "Máy học giỏi lên sau mỗi lần sai — bí quyết nằm ở 4 bước này."
- **Dàn ý cảnh:**
  1. Nơ-ron nhận đầu vào, nhân trọng số, cộng bias, qua hàm kích hoạt (minh họa bóng đèn sáng theo ngưỡng)
  2. Vòng lặp 4 bước: dự đoán → đo sai số → lan truyền ngược → cập nhật (mũi tên xoay vòng)
  3. Điểm dễ nhầm: backprop chỉ tính gradient, optimizer mới là người cập nhật
  4. Kết: càng nhiều dữ liệu đúng, mạng càng bớt sai
- **Claim ledger:**
  - "Backpropagation tính gradient; optimizer cập nhật tham số" — `[42]` `[44]` — VERIFIED
  - "Phi tuyến giúp mạng biểu diễn quan hệ mà biến đổi tuyến tính không làm được" — `[41]` — VERIFIED
- **Rủi ro / gate:** accuracy thấp (kiến thức phổ thông, có nguồn); không claim y tế/tài chính.
- **Thời lượng & format:** 60s, 1080x1920, voiceover + sub burn-in, beat 0.15 + ducking.
