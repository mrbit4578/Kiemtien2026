# Preset: Timelapse công trình ("Nể phục") — Hướng dẫn sử dụng

> Đúc kết từ phân tích video viral 1.3M views (@constructionandrestaura, repost @hang160).
> Format: **1 góc camera khóa cứng, 0 cú cắt, before → after**, vật neo bất khả thi giữ nguyên suốt video.

## 1. Tạo project từ preset (không cần viết prompt tay)

**Trên web:** Video Faceless → **Dự án mới** → chọn preset **"Timelapse công trình (Nể phục)"** → điền 4 ô:

| Ô | Điền gì | Ví dụ |
|---|---|---|
| Bối cảnh | Lô đất kiểu gì, xung quanh ra sao (tiếng Anh) | `narrow urban lot between two concrete houses, paved street in foreground, dense city skyline behind` |
| Vật neo | Nghịch lý không gian — vật thể bất khả thi, KHÔNG BAO GIỜ di chuyển | `giant granite boulder, 8 meters tall, occupying half the lot` |
| Kiến trúc | Phong cách công trình hoàn chỉnh | `modern minimalist 3-storey villa, raw concrete, floor-to-ceiling glass, vertical wood slats` |
| Chữ overlay | 1–2 từ cảm xúc, giữ nguyên giữa khung | `Nể phục` |

Chọn thời lượng rồi bấm **Tạo dự án**. Hệ thống tự:

1. Render shot-list thành **kịch bản** (mỗi shot: pha + mô tả thay đổi + prompt đầy đủ).
2. Điền **brief** (preset, thời lượng, 4 biến bối cảnh).
3. Điền **publish notes**: âm thanh (−35~−45 dBFS, không voice-over), overlay, vùng an toàn TikTok, 5 luật sắt.
4. Ghi **AI register A3** (hình ảnh AI chân thực → **bắt buộc gắn nhãn AI** khi đăng).

## 2. Quy trình dựng (sau khi có kịch bản)

1. **Khóa plate**: generate KF01 trước, ưng ý thì dùng làm ảnh tham chiếu cho mọi keyframe sau (cùng seed).
2. **Generate từng keyframe**: copy prompt trong kịch bản → image-to-image từ plate.
3. **Nội suy giữa 2 keyframe liền nhau**: image-to-video có start frame + end frame (Kling / Runway / Luma) hoặc RIFE/FILM — đây là bí quyết tạo "0 cú cắt".
4. **Nối + chuẩn hóa**: cross-dissolve 8–12 frame ở mối nối, giữ **24fps**, chỉnh màu một lần cho cả chuỗi.
5. **Âm thanh**: nhạc êm rất nhỏ + ambient công trường xa. Không voice-over.
6. **Overlay**: chữ ở ~40% chiều cao khung, giữ nguyên suốt video. Gắn nhãn AI khi đăng.

## 3. Hai bản thời lượng

| Bản | Shot dùng | Mỗi shot | Tổng |
|---|---|---|---|
| **45–60s** (khuyên dùng) | KF01 → 04 → 08 → 13 → 19 → 24 → 29 (+30 end card) | ~7s | ~60s |
| **5 phút** (đầy đủ) | KF01 → KF30 toàn bộ | ~10s + nội suy morph | ~5:30 |

## 4. 8 pha theo tỉ lệ % (áp dụng mọi độ dài)

| % thời lượng | Pha | Nội dung |
|---|---|---|
| 0–4% | **Before** | Giữ yên trên hiện trạng bất khả thi — đây là hook, đừng làm nhanh |
| 4–20% | Phá dỡ & phát quang | Lộ dần vật neo — khoảnh khắc "à, vấn đề là đây" |
| 20–43% | Phần ngầm | Đào, móng, thép, cột đầu tiên |
| 43–63% | Phần thân | Sàn, tầng, tường xây chèn |
| 63–77% | Vỏ & hoàn thiện | Kính, lam gỗ, sàn lát |
| 77–89% | Nội thất + hồ + đèn | Đèn vàng bật lần đầu = nhịp cảm xúc thứ hai |
| 89–96% | Cảnh quan + reveal | Cây, lối đi, cổng, hoàng hôn |
| 96–100% | Beauty shot | Giữ yên cho người xem ngắm |

**Ánh sáng kể chuyện song song**: sáng sớm → trưa gắt → hoàng hôn → đêm đèn vàng.

## 5. 5 luật sắt (vi phạm là hỏng video)

1. Camera lệch >5–10px giữa 2 keyframe = mất ảo giác timelapse.
2. Bước tiến độ quá lớn = morph nhão (5 phút cần ≥25 keyframe).
3. Không cắt cảnh — một cú cut là phá vỡ mạch.
4. Giữ ~4% đầu trên hiện trạng — không có hook "làm sao xây nổi?" thì khán giả không ở lại.
5. Vật neo không bao giờ di chuyển — đó là nhân vật chính.

## 6. API cho developer

- `GET /video/presets` — liệt kê preset
- `GET /video/presets/:presetId` — chi tiết preset (30 keyframes, prompt mẫu, duration maps)
- `POST /video/projects/from-preset` — tạo project từ preset
  ```json
  {
    "presetId": "timelapse-construction",
    "title": "Biệt thự ôm tảng đá",
    "boiCanh": "narrow urban lot between two concrete houses, …",
    "vatNeo": "giant granite boulder, 8 meters tall",
    "kienTruc": "modern minimalist 3-storey villa, …",
    "chu": "Nể phục",
    "duration": "short"
  }
  ```

Mã nguồn preset: `apps/api/nest-src/video/presets/timelapse-construction.ts`
