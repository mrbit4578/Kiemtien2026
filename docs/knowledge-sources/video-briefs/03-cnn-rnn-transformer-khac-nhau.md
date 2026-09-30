# Video brief 03 — CNN, RNN, Transformer khác nhau thế nào trong 60 giây

- **Nguồn:** `nn-knowledge-map-v1`, mục 4 (các họ mạng) — anchor `[14]` `[15]` `[30]` `[04]`
- **Đối tượng:** người tò mò về AI, học sinh/sinh viên
- **Góc mới (original-first):** mỗi kiến trúc là một "giác quan": CNN = mắt nhìn ảnh (quét từng vùng), RNN = trí nhớ kể chuyện (nhớ câu trước), Transformer = sự chú ý khi đọc (soi cả đoạn văn cùng lúc). Ẩn dụ và lời dẫn tự viết.
- **Hook gợi ý (0–3s):** "Cùng là mạng nơ-ron, sao cái thì nhìn ảnh, cái thì nói chuyện được?"
- **Dàn ý cảnh:**
  1. CNN: bộ lọc trượt trên ảnh, bắt cấu trúc cục bộ — dùng cho nhận diện khuôn mặt, kiểm tra lỗi ngoại quan
  2. RNN/LSTM: giữ trạng thái qua từng bước thời gian — dùng cho chuỗi, dự báo
  3. Transformer: attention nhìn toàn bộ đầu vào cùng lúc — nền tảng của ChatGPT
  4. Kết: chọn kiến trúc theo dữ liệu (ảnh/văn bản/chuỗi), và luôn thử nghiệm trước khi kết luận
- **Claim ledger:**
  - "CNN dùng bộ lọc chia sẻ trên các vị trí, khai thác cấu trúc cục bộ" — `[14]` — VERIFIED
  - "Transformer ghép attention, feedforward và thông tin vị trí" — `[30]` — VERIFIED
  - "LSTM/GRU dùng các cổng để điều tiết thông tin" — `[04]` `[15]` — VERIFIED
- **Rủi ro / gate:** accuracy thấp; các mốc năm (2012 AlexNet, 2017 Transformer) đã có trong video trước — giữ nhất quán.
- **Thời lượng & format:** 60s, 1080x1920, voiceover + sub burn-in, beat 0.15 + ducking.
