# Video brief 02 — 3 lỗi khiến AI học lệch mà người mới hay mắc

- **Nguồn:** `nn-knowledge-map-v1`, mục 3 (chia dữ liệu, rò rỉ, overfitting, metric) — anchor `[02]` `[25]` `[04]`
- **Đối tượng:** người mới học machine learning, sinh viên làm đồ án
- **Góc mới (original-first):** dạng "checklist bác sĩ khám bệnh cho mô hình": 3 triệu chứng → 3 cách chữa. Không sao chép cấu trúc mục 3 của tài liệu nguồn.
- **Hook gợi ý (0–3s):** "Mô hình của bạn 99% trên máy nhưng ra thực tế thì sai bét? Coi chừng 3 lỗi này."
- **Dàn ý cảnh:**
  1. Lỗi 1 — Rò rỉ dữ liệu: chuẩn hóa cả tập trước khi chia (minh họa đề thi lọt đáp án)
  2. Lỗi 2 — Overfitting: học vẹt dữ liệu train, không tổng quát hóa (đường cong train/val tách nhau)
  3. Lỗi 3 — Sai metric: chỉ nhìn accuracy trong khi cần precision/recall theo loại lỗi
  4. Kết: trước khi tăng độ sâu mạng, kiểm tra nhãn → chia dữ liệu → đường cong → mẫu sai
- **Claim ledger:**
  - "Tiền xử lý học thống kê (chuẩn hóa) phải fit trên tập train" — `[02]` `[25]` — VERIFIED
  - "Phân loại cần precision/recall/F1, không chỉ accuracy" — `[02]` `[14]` — VERIFIED
  - "Kết quả tốt trên train chưa đủ để quyết định triển khai" — mục 3.5 — VERIFIED (khuyến nghị biên soạn)
- **Rủi ro / gate:** accuracy thấp; không đưa ra lời khuyên đầu tư.
- **Thời lượng & format:** 60s, 1080x1920, voiceover + sub burn-in, beat 0.15 + ducking.
