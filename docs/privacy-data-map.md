# Privacy Data Map — OpenRemoteHub

> Cập nhật mỗi khi thêm provider hoặc feature mới.

## Dữ liệu thu thập theo provider

| Provider | Dữ liệu thu thập | Mục đích | Thời gian lưu | Không thu thập |
|---------|-----------------|---------|-------------|---------------|
| Google | provider_user_id, email_hash, display_name, token metadata | Đăng nhập, profile | Đến khi xóa tài khoản | Email body, Google Drive content, lịch sử tìm kiếm |
| Facebook | provider_user_id, name, token metadata, page list | Đăng nhập, business workflow | Đến khi revoke | Private messages, friend list, ad account data |
| Instagram | provider_user_id, professional account info, media metadata | Content calendar, publish | Đến khi revoke | DM, stories của người khác |
| TikTok | provider_user_id, display_name, token metadata | Đăng nhập, upload | Đến khi revoke | Following/follower list, DM, watch history |

## Consent requirements (Nghị định 13/2023/NĐ-CP)

1. Thông báo mục đích xử lý **trước** khi xử lý
2. Ghi nhận consent version, purpose, scope, thời điểm cấp quyền
3. Cho phép rút quyền bất kỳ lúc nào
4. Xóa dữ liệu theo yêu cầu trong 30 ngày
5. Không chuyển dữ liệu cho bên thứ ba khi chưa có consent riêng

## Data retention

- **Token** (encrypted): xóa ngay khi revoke hoặc disconnect
- **Audit log**: 2 năm (immutable)
- **Consent history**: 5 năm (theo quy định)
- **Content items**: xóa theo yêu cầu người dùng
- **User account**: soft delete 30 ngày → hard delete
