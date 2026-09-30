# Video brief 05 — Một ngày làm việc của AI Agent kho

- **Nguồn:** `nn-llm-agent-v1`, mục 3 (vòng lặp agent) + mục 9 (ví dụ đơn xuất kho) — anchor `[07]` `[08]`
- **Đối tượng:** quản lý kho, chủ xưởng sản xuất
- **Góc mới (original-first):** kể dạng nhật ký "8h00 agent nhận việc…": nhân hóa agent đi qua từng bước vòng lặp, mỗi lần tra cứu là một "chuyến đi". Sơ đồ mermaid của nguồn chỉ dùng để đối chiếu logic, không đưa lên hình.
- **Hook gợi ý (0–3s):** "8 giờ sáng, một nhân viên AI bắt đầu kiểm tra đơn hàng — và nó không cần ai chỉ từng bước."
- **Dàn ý cảnh:**
  1. Nhận yêu cầu: "kiểm tra đơn DH001, lập danh sách hàng thiếu"
  2. Vòng lặp: tra đơn → tra tồn kho → thấy thiếu size A-38 → tự tra kế hoạch sản xuất
  3. Cơ chế an toàn: giới hạn số bước, timeout, việc ghi dữ liệu phải có người duyệt
  4. Kết: báo cáo có nguồn tra cứu rõ ràng; phần "agentic" nằm ở việc tự chọn bước tiếp theo
- **Claim ledger:**
  - "Vòng lặp: LLM chọn bước → công cụ đọc/ghi → kết quả quay lại LLM" — mục 3.2 — VERIFIED
  - "Guard bắt buộc: max_steps, timeout, cost budget" — mục 3.3 — VERIFIED
  - "Mọi con số phải lấy từ công cụ, không để LLM tính nhẩm" — mục 2.2 — VERIFIED
- **Rủi ro / gate:** accuracy trung bình (quy trình đề xuất, chưa kiểm thử thực tế — theo phạm vi tài liệu nguồn); ghi rõ "mô phỏng minh họa".
- **Thời lượng & format:** 60s, 1080x1920, voiceover + sub burn-in, beat 0.15 + ducking.
