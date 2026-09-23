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

## Production (Render)

- Image cần: Node + `ffmpeg`/`ffprobe` + binary `concat-cli` (build trong Docker).
- Đơn giản nhất: cùng service, `CONCAT_ENABLED=true`, `CONCAT_AUTOSTART=true`,
  `CONCAT_WORK_DIR` trỏ vào disk persistent (Render Disk) để giữ MP4.
- Nặng hơn: tách worker render riêng (chạy `concat-cli serve` + API consumer),
  API chính đặt `CONCAT_AUTOSTART=false` + `CONCAT_API_TOKEN` trỏ tới worker.
- Token truyền **cleartext** trên TCP — chỉ bind `127.0.0.1` hoặc qua SSH tunnel/TLS.

## Troubleshooting

| Triệu chứng | Nguyên nhân / cách sửa |
|---|---|
| `health` báo `enabled:false` | Chưa đặt `CONCAT_ENABLED=true` |
| `503 Concat renderer chưa được bật` | Như trên |
| `Không nối được Concat serve` | Binary chưa có trên PATH, hoặc `ffmpeg` thiếu → xem log `[concat-cli]` |
| `wrong token` / `unauthorized` | `CONCAT_API_TOKEN` không khớp token của serve đang chạy |
| Job `failed [Busy]` | Có export khác đang chạy — job sau chờ hàng đợi, thử lại |
| `Asset vượt 500MB` | Nén/giảm độ phân giải source trước khi render |
