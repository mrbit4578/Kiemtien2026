# Concat Video Renderer

Kiemtien2026 render video **không watermark** bằng [Concat](https://github.com/jub0t/Concat)
(Rust + Slint video editor, AGPL-3.0) chạy **headless** qua `concat-cli serve`.

```
Content Studio / Agent ──POST /render/jobs──▶ RenderModule (NestJS)
                                                   │ JSON-RPC (TCP, auth token)
                                                   ▼
                                            concat-cli serve ──▶ MP4 (1080x1920, H.264)
```

## API

| Endpoint | Mô tả |
|---|---|
| `GET /render/health` | Trạng thái renderer (enabled/connected, version Concat) |
| `GET /render/catalogue?kind=effect` | Liệt kê effect package → chọn `effectId` |
| `POST /render/jobs` | Tạo job (202, chạy nền). Body: `name`, `clips[]`, `captions[]`, `effectId?`, `width/height/rateNum/rateDen?`, `crf/preset/codec?` |
| `GET /render/jobs?limit=` | Job gần nhất của workspace |
| `GET /render/jobs/:id` | Trạng thái + `progress` 0..1 |
| `DELETE /render/jobs/:id` | Hủy export đang chạy |
| `GET /render/jobs/:id/file` | Tải MP4 đã render xong |

Mặc định xuất **dọc 1080x1920, 30fps, H.264, CRF 20** — khổ TikTok/Reels/Shorts.

Ví dụ:

```bash
curl -X POST https://kiemtien2026-api.onrender.com/render/jobs \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{
    "name": "video-vpbank-01",
    "clips": [{"source": "https://example.com/quay-1.mp4"}],
    "captions": [
      {"text": "Mở thẻ VPBank 2 phút online", "start": 0, "duration": 3},
      {"text": "Link đăng ký ở bio", "start": 3, "duration": 3}
    ]
  }'
# → {"job": {"id": "...", "status": "queued", "progress": 0}}
```

Agent ("Chế độ Agent") có tool **`render_video`** với cùng spec — model tự dựng
video từ kịch bản mà không cần gọi API thủ công.

## Cài đặt concat-cli

Concat chưa có binary phát hành cho Render — build từ source (cần Rust + FFmpeg):

```bash
git clone https://github.com/jub0t/Concat && cd Concat/src
cargo build --release -p concat-cli
# binary: target/release/concat-cli (cần ffmpeg + ffprobe trên PATH lúc chạy)
```

Thử tay trước khi nối API:

```bash
concat-cli serve --json 127.0.0.1:7420   # in token ra stdout
# terminal khác:
printf '%s\n' \
 '{"jsonrpc":"2.0","id":0,"method":"auth","params":{"token":"<TOKEN>"}}' \
 '{"jsonrpc":"2.0","id":1,"method":"version"}' \
 | nc 127.0.0.1 7420
```

## Biến môi trường (API)

| Biến | Mặc định | Mô tả |
|---|---|---|
| `CONCAT_ENABLED` | `false` | `true` mới bật renderer (fail-closed) |
| `CONCAT_AUTOSTART` | `true` | Tự spawn `concat-cli serve` như child process |
| `CONCAT_CLI_PATH` | `concat-cli` | Đường dẫn binary |
| `CONCAT_HOST` / `CONCAT_PORT` | `127.0.0.1` / `7420` | Địa chỉ serve; `PORT=0` + autostart = chọn port trống |
| `CONCAT_SOCKET` | — | Unix socket thay cho TCP (ưu tiên khi đặt) |
| `CONCAT_API_TOKEN` | tự sinh (autostart) | Token auth; **bắt buộc** khi `AUTOSTART=false` |
| `CONCAT_WORK_DIR` | `$TMPDIR/kiemtien2026-concat` | projects/, jobs/, exports/ |
| `CONCAT_ASSETS_DIR` | — | Cho phép source là file local trong thư mục này (chống traversal) |
| `CONCAT_EXPORT_TIMEOUT_MS` | 6 giờ | Timeout chờ `export.done` |
| `CONCAT_REQUEST_TIMEOUT_MS` | 30s | Timeout mỗi lời gọi JSON-RPC |

## Luồng render (trong RenderService)

1. **Asset**: URL http(s) → tải qua SSRF guard (`assertSafeUrl`, cap 500MB);
   file local chỉ khi nằm trong `CONCAT_ASSETS_DIR`.
2. `media.probe` từng file → độ dài clip để xếp timeline.
3. `project.create` → `media.import` từng file (lấy media id).
4. `edit.apply` một `Batch`: `addClipAtFirstFree` nối tiếp + `addTextClip`
   caption (`above: true`, lower-third) + `addLayerClip` hiệu ứng (nếu có).
5. `export.run` → job Concat (`j1`…); chờ event `export.done` / `export.failed`,
   cập nhật `progress` từ `export.progress`.
6. MP4 lưu ở `CONCAT_WORK_DIR/exports/<jobId>.mp4`; DB `render_jobs` lưu trạng thái.

**Giới hạn cần biết**: Concat chỉ chạy **1 export tại một thời điểm**
(export thứ hai bị từ chối `Busy`) — service serialize job qua hàng đợi nội bộ.
Job lưu trong DB nên restart API không mất lịch sử, nhưng job đang `running`
lúc restart sẽ kẹt — cần dọn thủ công hoặc chạy lại.

## Production — Deploy Docker trên Render

### Kiến trúc

1 image duy nhất (sidecar): **Node API + `concat-cli` + ffmpeg**.
API tự spawn `concat-cli serve` local (`CONCAT_AUTOSTART=true`) và điều khiển
qua JSON-RPC. `media.import` nhận filesystem path, MP4 output nằm trên disk
của chính container — vì vậy KHÔNG tách renderer ra service riêng.

- `Dockerfile` (root repo), multi-stage:
  - `rust-builder` (`rust:1.93-bookworm`): build `concat-cli` từ vendored
    source `docker/concat-src/` (Concat 0.2.3 + kaizen fixes, đã loại `target/`).
    Bookworm có FFmpeg 5.1 (libavcodec 59.37.100) — vừa đủ yêu cầu build.rs
    (≥ 59.37). Binary cần GLIBC_2.38+ nên KHÔNG dùng alpine.
  - `node-builder` (`node:20-bookworm`): `pnpm install` + `pnpm --filter @orh/api build`.
  - `runtime` (`node:20-bookworm-slim`): `apt-get install ffmpeg` (binary +
    toàn bộ libav* runtime mà concat-cli link tới) + pnpm global (cho
    preDeploy migrate) + binary tại `/usr/local/bin/concat-cli`.
    Build tự verify: `concat-cli --version` và `ldd` không thiếu lib nào —
    thiếu là fail build ngay.
- `render.yaml` có **2 service**:
  - `kiemtien2026-api` (runtime node, cũ) — giữ nguyên cho tới khi cutover.
    Render KHÔNG cho đổi runtime của service đã tạo nên bắt buộc thêm service mới.
  - `kiemtien2026-api-docker` (runtime docker) — service production mới,
    `CONCAT_ENABLED=true`, `CONCAT_CLI_PATH=/usr/local/bin/concat-cli`,
    `CONCAT_AUTOSTART=true`.

### ⚠️ Bài học 2026-09-23: KHÔNG dùng `generateValue` cho key mã hóa

`TOKEN_ENCRYPTION_KEY` (và `SESSION_SECRET`) để `sync: false`, nhập tay 1 lần.
Mỗi lần re-apply blueprint với `generateValue: true`, Render sinh key mới →
mọi API key/OAuth token đã mã hóa trong DB bằng key cũ **không giải mã được
nữa** ("Lỗi giải mã key: TOKEN_ENCRYPTION_KEY..."). Đây là nguyên nhân khả nghi
nhất của sự cố giải mã key ngày 2026-09-23.

### Checklist migration (làm trên dashboard, từng bước một)

1. **Blueprint Sync**: Render Dashboard → service `kiemtien2026-api` → Blueprint
   → Sync (hoặc New → Blueprint) để Render tạo service mới
   `kiemtien2026-api-docker`. Service cũ vẫn chạy bình thường.
2. **Copy env vars** từ service cũ sang service mới (Environment tab → copy từng
   giá trị, KHÔNG gõ lại):
   - `DATABASE_URL`, `REDIS_URL`, `DIRECT_DATABASE_URL` (nếu đã set)
   - `SESSION_SECRET` — copy ĐÚNG, đổi là rớt session toàn bộ user
   - `TOKEN_ENCRYPTION_KEY` — copy ĐÚNG giá trị hiện tại, đổi là "Lỗi giải mã key"
     toàn bộ AI Pro + OAuth tokens (sự cố 2026-09-23)
   - Mọi key OAuth/AI khác (GOOGLE_*, FACEBOOK_*, TIKTOK_*, CLOUDINARY_*...)
3. Đợi deploy xong → mở `https://kiemtien2026-api-docker.onrender.com/render/health`
   → phải thấy `enabled: true`, `connected: true`.
4. **Test 1 job render E2E**: `POST /render/jobs` với 1 clip ngắn → poll
   `GET /render/jobs/:id` tới `done` → `GET /render/jobs/:id/file` tải MP4 về
   xem thử. (Lưu ý: Render free/starter không có persistent disk — MP4 mất khi
   restart; gắn Render Disk vào `CONCAT_WORK_DIR` nếu cần giữ file.)
5. **Cutover**:
   - Vercel (web): đổi `NEXT_PUBLIC_API_URL` (hoặc env tương đương) sang domain mới.
   - OAuth callbacks: TikTok / Google / Instagram / Facebook developer dashboards
     → thêm callback `https://kiemtien2026-api-docker.onrender.com/auth/<provider>/callback`.
     (Callback cũ vẫn giữ tới khi chắc chắn không còn traffic.)
   - Kiểm tra AI Pro hết "Lỗi giải mã key" (nếu còn → `TOKEN_ENCRYPTION_KEY`
     copy sai, sửa lại đúng giá trị service cũ).
6. **Xóa service cũ** `kiemtien2026-api` chỉ khi: web đã trỏ domain mới ≥ 24h,
   OAuth login/post test OK trên domain mới, không còn log traffic ở service cũ.

## Troubleshooting

## Troubleshooting

| Triệu chứng | Nguyên nhân / cách sửa |
|---|---|
| `health` báo `enabled:false` | Chưa đặt `CONCAT_ENABLED=true` |
| `503 Concat renderer chưa được bật` | Như trên |
| `Không nối được Concat serve` | Binary chưa có trên PATH, hoặc `ffmpeg` thiếu → xem log `[concat-cli]` |
| `wrong token` / `unauthorized` | `CONCAT_API_TOKEN` không khớp token của serve đang chạy |
| Job `failed [Busy]` | Có export khác đang chạy — job sau chờ hàng đợi, thử lại |
| `Asset vượt 500MB` | Nén/giảm độ phân giải source trước khi render |
| Docker build fail ở `rust-builder` | Thiếu network ra crates.io lúc build, hoặc tag `rust:1.93-bookworm` chưa có → thử `rust:bookworm` |
| Docker build fail ở bước `ldd` | Thiếu libav* runtime — kiểm tra `apt-get install ffmpeg` chạy đúng trên bookworm-slim |
| `preDeployCommand` báo `pnpm: not found` | Runtime stage thiếu `npm install -g pnpm` — kiểm tra Dockerfile |
| MP4 mất sau restart | Render không có persistent disk mặc định → gắn Disk vào `CONCAT_WORK_DIR` |
