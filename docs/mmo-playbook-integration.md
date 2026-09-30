# Tích hợp playbook MMO/AI/TikTok vào Kiemtien2026

Nguồn: `docs/knowledge-sources/lo-trinh-mmo-ai-tiktok.md`
(`doc_id: mmo-ai-tiktok-roadmap-v1`, 11 chương, 24 nguồn — tra cứu 30/09/2026).
Nhánh: `feat/mmo-playbook-integration`.

Triết lý giữ nguyên từ playbook: **evidence-first** — chỉ chấm/chỉ claim khi có
bằng chứng; nhãn `[Inference]` / `[Unverified]` / `[Speculation]` không được
xóa khi dùng nội dung để tạo video/sản phẩm.

## Ánh xạ chương → code

| Chương playbook | Điểm tích hợp | Triển khai |
|---|---|---|
| 01 Tìm ngách bằng bằng chứng | Bảng ghi bằng chứng + chấm điểm 30/25/20/15/10 | `NicheEvidence` (Prisma) · `niche/niche-evidence.ts` (pure) · `GET/POST/DELETE /niches/evidence` · `GET /niches/evidence-score` · mixer cộng `evidenceBoost` (trọng số 0.10 lấy từ base) khi có dữ liệu |
| 02 Đọc đúng nguồn tìm ngách | Tách "người xem hỏi" vs "AI suy ra" | Trường `questionText/url/metricSeen` (người xem) vs `metricNotProven/contentIdea/checkResult` (AI) trong `NicheEvidence` |
| 03 Mạng nơ-ron ở đâu | LLM/embedding/TTS/STT/điều phối | Đã có (AI providers, RAG, videogen, Studio); playbook xác nhận kiến trúc hiện tại — không thêm mới |
| 04 Chọn cơ chế thu nhập trước | 6 mô hình + đề nghị mua đã kiểm chứng | `MonetizationOffer` (Prisma) · `GET/POST/PATCH/DELETE /mmo/offers` · `GET /mmo/models` · cờ `verified` bắt buộc trước khi tính hòa vốn |
| 05 Tính hiệu quả thay vì đoán | Công thức affiliate, hòa vốn, KPI tiền | `mmo/mmo-economics.ts` (pure: `simulateAffiliateCommission`, `breakevenOrders`, `summarizeEconomics`) · `VideoEconomics` (Prisma) · `PUT/GET /mmo/economics/:projectId` · `GET /mmo/economics/:projectId/summary` · `POST /mmo/simulate` (cờ `hypothetical: true`) |
| 06 Nội dung vừa vui vừa có ích | Bảng phát biểu → nguồn → đoạn căn cứ → hình minh họa | `VideoClaim` thêm `evidenceExcerpt`, `sceneRef`, `scriptCode` · `video/claim-evidence.ts` (`validateClaimMarkers`) · `GET /video/projects/:id/claim-check` |
| 07 Dây chuyền tạo video | Prompt biên kịch dùng lại | `video/scriptwriter-prompt.ts` (`SCRIPTWRITER_PROMPT_TEMPLATE`, checklist) · `GET /video/scriptwriter-prompt` · auto-build tự gán mã `[Cn]` + đọc `evidence` từ AI |
| 08 Kịch bản mẫu 54s | Bộ mẫu giày → brief tái dùng | `docs/knowledge-sources/video-briefs/07-ai-hoc-nhan-ra-chiec-giay-bo-mau-54s.md` (claim ledger [C0]–[C4], SRT, prompt nhân vật, caption) |
| 09 Tăng trưởng bằng phép thử | Mã số liệu mỗi video; nhãn AI; khai báo thương mại; nhạc CML | `VideoEconomics` (views, watchTime, completion, saves/shares, clicks, orders, eligibleOrders, commissionReceived, utm, organic) · `complianceJson` trên `VideoProject` · `POST/GET /video/projects/:id/compliance` · `checkPublishReadiness` chặn khi thiếu checklist |
| 10 Kiến trúc tự động hóa | Human-in-the-loop trước publish | Đã có (approvalStatus ở ContentItem); playbook xác nhận — không thêm mới |
| 11 Lộ trình thử 30 ngày | Khung thử nghiệm theo giai đoạn | Chưa code hóa (theo dõi thủ công); ứng viên cho `TrialPlan` ở đợt sau |

## Quy tắc bất biến mới

1. **Ngách chưa có bằng chứng → điểm evidence = 0**, không suy diễn; mixer giữ
   nguyên trọng số cũ khi workspace chưa có dòng bằng chứng nào.
2. **Claim `unverified` đang mở → câu tương ứng trong kịch bản BẮT BUỘC ghi
   "CHƯA XÁC MINH".** Kiểm tra bằng `claim-check` trước khi dựng.
3. **Tiền chỉ tính từ sổ quyết toán** (`commissionReceived`); `simulate` luôn
   trả `hypothetical: true` — không trình bày số giả định như dự báo.
4. **Publish bị chặn khi chưa khai báo checklist tuân thủ** (nhãn AI, khai báo
   thương mại, quyền nhạc). Điền 1 lần ở tab QA & Risk.
5. **Creator Rewards/Series chưa xác minh trên tài khoản → không đưa vào dự toán**
   (giữ cờ `verified=false` ở offer).

## Migration

`apps/api/prisma/migrations/2026093002_mmo_playbook/` — tạo bảng
`niche_evidence`, `monetization_offers`, `video_economics`; thêm cột
`video_claims(evidenceExcerpt, sceneRef, scriptCode)`,
`video_projects(complianceJson)`. Render tự chạy migration khi deploy.
