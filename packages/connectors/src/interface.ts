import type {
  OAuthStartInput,
  OAuthCallbackInput,
  TokenSet,
  Connection,
  ProviderIdentity,
  PublishInput,
  PublishResult,
  PermissionManifest,
  Provider,
} from '@orh/shared'

/**
 * Interface chung cho tất cả social connector.
 * Mỗi provider implement interface này với scope, token,
 * rate limit, webhook và lỗi riêng.
 */
export interface SocialConnector {
  provider(): Provider
  manifest(): PermissionManifest

  /** Tạo authorization URL để redirect user sang provider */
  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string

  /** Đổi authorization code lấy token (PKCE) */
  exchangeCode(input: OAuthCallbackInput): Promise<TokenSet>

  /** Lấy identity tối thiểu để xác minh connection */
  getIdentity(connection: Connection): Promise<ProviderIdentity>

  /** Revoke token khi user disconnect */
  revoke(connection: Connection): Promise<void>

  /** Refresh access token (nếu provider hỗ trợ) */
  refresh?(connection: Connection): Promise<TokenSet>

  /** Publish nội dung (chỉ connector có capability này) */
  publish?(input: PublishInput): Promise<PublishResult>

  /**
   * Kiểm tra bài đăng có thật sự tồn tại trên provider không.
   * Phục vụ nhánh 'publish_confirm_pending' của publish worker: bài có thể đã
   * được đăng nhưng worker chưa ghi 'done' (DB hiccup ngay sau publish).
   * Không implement → worker đánh dấu done kèm audit warn, KHÔNG publish lại.
   */
  verifyPublish?(connection: Connection, platformPostId: string): Promise<boolean>
}
