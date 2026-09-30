# Knowledge Sources — Mạng nơ-ron & LLM/AI Agent

Thư mục tri thức đã qua kaizen, sẵn sàng đưa vào pipeline Video Faceless
(`POST /video/projects/auto-build`) và hệ thống RAG của Kiemtien2026.

## Nội dung

| File | Mô tả |
|---|---|
| `ban-do-kien-thuc-mang-no-ron-ai.md` | Bản đồ kiến thức mạng nơ-ron — 50 nguồn `[01]`–`[50]`, lộ trình 16 tuần. `doc_id: nn-knowledge-map-v1` |
| `ung-dung-mang-no-ron-llm-ai-agent.md` | LLM & AI Agent cho doanh nghiệp — 16 nguồn `[01]`–`[16]`, vòng lặp agent, tool design, pilot eval. `doc_id: nn-llm-agent-v1` |
| `sources-index.json` | Index machine-readable của toàn bộ 66 nguồn: `doc_id`, `code`, `name`, `author`, `year`, `url`, `note`, `section` |
| `video-briefs/` | 6 brief intake (mỗi brief < 2KB, dưới giới hạn 20000 ký tự của auto-build) |

Bản gốc của hay giữ nguyên tại `~/workspace/user/files/` — đây là bản tích hợp,
không sửa bản gốc.

## Kaizen đã áp dụng (so với bản gốc)

1. Thêm `doc_id` vào frontmatter cả 2 file → tra cứu chéo machine-readable
   (`cross_refs` trỏ sang doc còn lại).
2. Thêm `https://` cho 52 địa chỉ nguồn dạng domain trần → URL dùng được ngay.
3. Sinh `sources-index.json` từ bảng Markdown → nạp thẳng vào claim ledger / RAG.
4. Tách lớp "video brief" ra file riêng — giữ triết lý original-first:
   brief chỉ lấy **chủ đề + dữ kiện** từ nguồn, góc kể và lời dẫn viết mới hoàn toàn.

## Cách dùng với pipeline

```text
1. Đọc 1 file trong video-briefs/ (topic + angle + claim ledger đã soạn sẵn).
2. POST /video/projects/auto-build với { content: <nội dung brief> }.
3. AI tự điền brief → script → caption → claim ledger (đối chiếu anchor
   [mã nguồn] trong sources-index.json) → AI register → risk score.
4. Claim nào gắn VERIFIED trong brief → giữ; claim ngoài nguồn → đánh UNVERIFIED.
```

## Quy ước mở rộng

- Thêm nguồn mới: tăng `version` trong frontmatter, **giữ nguyên** mã `[01]`–`[50]` /
  `[01]`–`[16]` để không vỡ tham chiếu, rồi chạy lại script sinh index.
- Brief mới: đặt tên `NN-<chủ đề>.md`, luôn có mục Claim ledger với anchor nguồn.
- Mọi ví dụ số liệu doanh nghiệp trong brief là minh họa giả lập — khi dựng video
  thật phải thay bằng dữ liệu đã xác minh hoặc ghi rõ "mô phỏng".
