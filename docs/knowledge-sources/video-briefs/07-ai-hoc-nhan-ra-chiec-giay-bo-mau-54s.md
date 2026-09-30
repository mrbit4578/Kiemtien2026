# Video brief 07 — AI học nhận ra một chiếc giày như thế nào? (bộ mẫu 54s)

- **Nguồn:** `mmo-ai-tiktok-roadmap-v1`, chương 08 (kịch bản mẫu) + `Huong_dan_va_prompt.md` trong bộ mẫu; kiến thức: `[01]` TensorFlow Basic classification, `[02]` MLCC backpropagation, `[03]` MLCC dividing datasets
- **Đối tượng:** người mới tò mò về AI, học sinh/sinh viên
- **Góc mới (original-first):** nhân vật đồ vật — chiếc giày "giật mình" khi bị gọi nhầm là túi; dạy phân loại ảnh qua 3 ý: điểm ảnh → học từ nhãn → kiểm tra trên ảnh mới. Tình huống mở đầu đánh dấu HƯ CẤU.
- **Hook gợi ý (0–3s):** "Khoan! Tôi là giày… sao lại gọi tôi là túi?"
- **Dàn ý cảnh (7 phân đoạn, SRT đi kèm):**
  1. 00–06s nhân vật giày phản ứng (hư cấu) | 2. 06–14s ảnh → dãy số điểm ảnh | 3. 14–23s vòng lặp dự đoán–so nhãn–chỉnh trọng số | 4. 23–31s điểm cao trên ảnh đã học ≠ xử lý tốt ảnh mới | 5. 31–40s tách tập kiểm tra | 6. 40–48s nhắc 2 ý chính | 7. 48–54s CTA tập tiếp theo
- **Claim ledger (mã [Cn] ↔ câu trong kịch bản):**
  - [C1] "Đầu vào của mạng là các con số biểu diễn điểm ảnh" — `[01]` — VERIFIED
  - [C2] "Huấn luyện có giám sát: dự đoán, so nhãn đúng, điều chỉnh trọng số để giảm sai số" — `[02]` — VERIFIED
  - [C3] "Điểm cao trên ảnh đã học chưa chứng minh xử lý tốt ảnh mới" — `[03]` — VERIFIED
  - [C4] "Cần đánh giá bằng tập kiểm tra tách biệt, chưa dùng để huấn luyện" — `[03]` — VERIFIED
  - [C0] "Tôi là giày sao lại gọi tôi là túi" — HƯ CẤU (đánh dấu trong video)
- **Prompt nhân vật:** giày sneaker xanh ngọc/dây cam nhân hoá, mắt miệng trên thân giày, tay hoạt hình, nền trong suốt, không chữ/logo (file `Nhan_vat_giay_AI.png` trong bộ mẫu).
- **Rủi ro / gate:** accuracy thấp (kiến thức phổ thông, có nguồn); KHÔNG claim y tế/tài chính; bản 54s < 1 phút → KHÔNG đủ điều kiện Creator Rewards; chưa có giọng đọc (SRT mốc dự kiến, thu âm xong canh lại).
- **Thời lượng & format:** 54s, 1080x1920, 24fps; khi dựng lại: voiceover Briggs + sub burn-in + beat 0.15 + ducking.
