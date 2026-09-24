# Hệ thống Video Faceless — Audit & Spec Kaizen

> Nguồn: `workspace/user/files/he-thong-video-faceless-tu-nguon-viral.md`
> Ngày audit: 2026-09-24. Đối tượng triển khai: solo creator Việt Nam trên Kiemtien2026.

---

## Phần 1 — Audit tài liệu gốc

### 1.1. Điểm mạnh (giữ nguyên)

1. **Tách 4 lớp** (chủ đề / dữ kiện / thể hiện / nhận diện) — đúng bản chất luật bản quyền, là insight cốt lõi.
2. **Hai cổng độc lập**: copyright clearance ≠ platform monetization. Nhiều creator nhầm 2 cổng này.
3. **Permission-first, original-first, evidence-first** — triết lý đúng, dễ nhớ.
4. **Ledgers cụ thể** (rights / claim / AI register) — biến compliance thành artifact làm được.
5. **8 publish gates** — checklist vận hành được ngay.
6. **Disclosure templates** — copy-paste được.

### 1.2. Điểm yếu & khoảng trống (đã fix trong spec bên dưới)

| # | Vấn đề | Mức độ | Cách fix |
|---|---|---|---|
| 1 | Viết cho **team** ("reviewer", "second reviewer") — user là solo creator | Cao | Bản self-review: checklist thay người duyệt |
| 2 | 10 bước **không có time box / definition of done** — research có thể nuốt cả tuần | Cao | Thêm time box + DoD mỗi bước |
| 3 | **Không có fail-fast gate**: nếu angle trượt originality thì dừng sớm, đừng làm tiếp | Cao | Gate G0 sau bước 3 |
| 4 | Risk score **cộng dồn tuyến tính**, các yếu tố không độc lập (C cao thường kéo M cao) → double-counting | Trung bình | Giữ công thức + thêm **single-factor veto** |
| 5 | Không có **kill criteria cho 1 yếu tố đơn lẻ** (VD: A4 mô phỏng người thật không consent = reject ngay dù tổng điểm thấp) | Cao | Veto rules |
| 6 | Nhắc "quy trình khiếu nại" nhưng **không có dispute workflow chi tiết** | Trung bình | Thêm quy trình Content ID / TikTok appeal |
| 7 | **Thiếu checklist VN**: Điều 32 BLDS 2015 được nhắc nhưng không có hướng dẫn thực hành (nhạc VN, hình người VN, Luật Quảng cáo) | Trung bình | Thêm VN checklist |
| 8 | AI register A0–A4 **chưa map với công cụ thực tế** của Kiemtien2026 | Trung bình | Map A0–A4 → agent/TTS/avatar trong app |
| 9 | Mô tả cột CSV nhưng **không có template dùng được** | Thấp | 3 bảng DB + UI trong app |
| 10 | **Thiếu repurposing**: 1 kịch bản → TikTok/Reels/Shorts điều chỉnh ra sao | Trung bình | Thêm bước repurpose trong publish |
| 11 | **Thiếu series format**: brand faceless bền vững nhờ format lặp lại, không phải video lẻ | Trung bình | Thêm "Video #N trong series" vào project |
| 12 | **Originality test** chỉ là 1 câu hỏi tu từ → cần thành checklist yes/no | Trung bình | 5 câu hỏi O1–O5 |
| 13 | Disclosure templates **US-centric** (FTC) | Thấp | Bản tiếng Việt + lưu ý TikTok VN |
| 14 | Mục `FILE_INTAKE_PENDING` là meta của tài liệu gốc, **không còn giá trị vận hành** | Thấp | Bỏ |

---

## Phần 2 — Spec Kaizen (bản vận hành cho solo creator VN)

### 2.1. Nguyên tắc bất biến

1. **Viral là tín hiệu, không phải nguyên liệu.** Không tải, không re-upload, không đọc lại lời của video nguồn.
2. **Permission-first.** Asset nào chưa cleared thì chưa publish.
3. **Evidence-first.** Claim nào chưa xác minh thì không thành khẳng định.
4. **Mỗi video là một gói sản phẩm**: script + evidence + rights + disclosure + edit + receipt + correction log.

### 2.2. Pipeline 10 bước (có time box & DoD, fail-fast)

| Bước | Tên | Time box | Done khi |
|---|---|---|---|
| 1 | Tiếp nhận | 15' | Có URL/mô tả nguồn + mục tiêu khán giả |
| 2 | Phân tích nguồn | 30' | Tách được: chủ đề / hook / claim / format / phản ứng khán giả — **không tải asset** |
| 3 | Chọn góc | 30' | 1 angle mới + **qua G0 originality test** |
| G0 | **Fail-fast gate** | — | Trượt O1–O5 → đổi angle hoặc bỏ, KHÔNG làm tiếp |
| 4 | Nghiên cứu | 2h | Claim ledger: mỗi claim quan trọng có ≥1 nguồn độc lập |
| 5 | Kịch bản | 1h | Script + caption + lưu ý đăng bài (đúng output contract) |
| 6 | Tài sản | 1h | Mọi asset có dòng trong rights ledger, status = cleared |
| 7 | Giọng đọc | 45' | Voice thu xong / TTS có license; AI-voice chân thực → disclosure |
| 8 | Dựng | 2h | Video nháp + subtitle |
| 9 | QA gates | 30' | G1–G8 pass, risk score ≤ 7 (hoặc có veto → xử lý) |
| 10 | Xuất bản & học | 30' | Receipt từng nền tảng + lịch xem analytics sau 48h |

Tổng: ~8h/video cho quy trình đầy đủ. Video đơn giản (opinion, không claim rủi ro) có thể gọn còn ~3h (bỏ bớt bước 4 sâu, gộp 6–7).

### 2.3. G0 — Originality test (5 câu, phải YES hết)

- **O1**: Nếu xóa video nguồn khỏi quy trình, video này vẫn đứng được như một sản phẩm độc lập?
- **O2**: Hook, cấu trúc và kết luận là của mình, không phải dịch/viết lại từ nguồn?
- **O3**: Không dùng lại câu chữ, montage, nhạc, nhịp dựng, thumbnail của nguồn?
- **O4**: Video này KHÔNG thay thế nhu cầu xem video nguồn (phục vụ mục đích/khán giả khác)?
- **O5**: Mình có thể giải thích giá trị mới trong 1 câu cho nền tảng/sponsor?

### 2.4. Risk score v2 (giữ công thức + veto)

`R = C + P + L + A + M + H`, mỗi yếu tố 0–3.

| Tổng | Quyết định |
|---|---|
| 0–3 | Tiếp tục (self-review theo checklist) |
| 4–7 | Dừng 1 ngày, bổ sung nguồn/license rồi review lại |
| 8–11 | Viết lại / bỏ asset / xin permission |
| 12–18 | Reject hoặc chuyển thành nội dung giáo dục khái quát |

**Single-factor veto** (bất chấp tổng điểm):
- A4 (mô phỏng người thật) **không consent** → REJECT.
- Bất kỳ yếu tố nào = 3 ở **A** (accuracy) với claim sức khỏe/tài chính → REJECT hoặc gỡ claim.
- Nhạc không rõ license → REJECT asset đó (thay nhạc), không reject cả video.

### 2.5. 8 cổng QA (giữ nguyên, thêm self-review)

G1 Source · G2 Rights · G3 Originality · G4 Accuracy · G5 AI/privacy · G6 Platform · G7 Commercial · G8 Accessibility — mỗi cổng: pass/fail + ghi chú. Solo creator tự check, với video có R ≥ 8 thì để "ngủ" 24h rồi check lại lần 2.

### 2.6. Dispute workflow (mới)

1. **Content ID claim (YouTube)**: kiểm tra rights ledger → nếu cleared → dispute kèm proof; nếu không chắc → gỡ/thay asset, đừng dispute bừa (strike risk).
2. **Takedown / strike**: dừng publish series liên quan, rà lại asset cùng nguồn.
3. **TikTok appeal**: appeal trong app + lưu receipt; nếu trượt 2 lần → làm lại video theo hướng original hơn.
4. Mọi vụ việc ghi vào correction log của project.

### 2.7. VN checklist (mới)

- Hình ảnh người Việt trong video thương mại: cần đồng ý (Điều 32 BLDS 2015), trừ trường hợp luật cho phép.
- Nhạc Việt: không dùng bản thu commercial nếu chưa có license; ưu tiên TikTok Commercial Music / YouTube Audio Library / nhạc tự sản xuất.
- Quảng cáo/affiliate: tuân thủ Luật Quảng cáo — ghi rõ "quảng cáo/tài trợ", không gây nhầm lẫn.
- Claim sức khỏe/tài chính: rủi ro cao nhất với cả luật VN và policy nền tảng — mặc định yêu cầu 2 nguồn độc lập.

### 2.8. AI register map cho Kiemtien2026

| Dùng AI ở đâu | Phân loại | Disclosure |
|---|---|---|
| Agent research, viết script, sửa lỗi | A1 | Không bắt buộc |
| Ảnh minh họa AI rõ ràng hư cấu | A2 | Nên ghi chú |
| TTS voiceover nghe như người thật | A3 | Bắt buộc label AI (TikTok/YouTube/Meta) |
| Avatar/mặt/giọng mô phỏng người thật | A4 | Mặc định REJECT nếu không có consent văn bản |

### 2.9. Repurposing & series (mới)

- 1 kịch bản gốc → 3 bản cắt: TikTok (hook 0–3s mạnh), Reels (CTA link bio), Shorts (giữ retention 30s).
- Mỗi project thuộc 1 **series format** (VD: "3 phút kiểm chứng") — format lặp lại tạo brand faceless bền vững hơn video lẻ viral.

---

## Phần 3 — Map tích hợp vào Kiemtien2026

| Bước pipeline | Công cụ trong app | Trạng thái |
|---|---|---|
| 1–3. Intake → Angle | Agent tool `video_brief` (bắt buộc qua G0 originality test mới cho đi tiếp) | **MỚI build** |
| 4. Research | `web_search` + `fetch_url` (có sẵn) → claim ledger trong project | Có sẵn + UI mới |
| 5. Script | Agent tool `video_script` (validate claim unverified rủi ro cao thì chặn) + output contract | **MỚI build** + cải tiến contract |
| 6. Assets | Rights ledger UI (thêm/sửa/xóa, status cleared/pending/reject) | **MỚI build** |
| 7. Voice | User tự thu/upload; TTS tích hợp sau (gap) | Gap — ghi nhận |
| 8. Dựng | `render_video` (Concat) — đang park chờ upgrade RAM | Có sẵn (parked) |
| 9. QA | Gates G1–G8 checklist + `video_risk_score` tool | **MỚI build** |
| 10. Publish | "Gửi sang Content Studio" → publish pipeline TikTok/IG/FB có sẵn | **MỚI build** (nút chuyển) |
| Xuyên suốt | Trang **Video Faceless**: project tracker + 3 ledgers + gates + risk | **MỚI build** |
| Guardrails | Agent system prompt: thêm doctrine original-first/evidence-first/permission-first | Cải tiến hiện có |
| Disclosure | Output contract thêm khối `## LƯU Ý ĐĂNG BÀI` (AI label, affiliate, nhạc, nguồn claim) | Cải tiến hiện có |

**Gap ghi nhận (chưa làm trong đợt này):** TTS voiceover tích hợp (cần API key + chi phí), dispute workflow tự động (hiện là checklist tay), analytics 48h tự động (hiện xem tay).
