import type { SocialConnector } from './interface';
import { requiredEnv } from './env';
import type { Connection, OAuthStartInput, OAuthCallbackInput, TokenSet, ProviderIdentity, PermissionManifest, Provider } from '@orh/shared'
import { buildOAuthUrl, validateRedirectUri } from '@orh/auth'
import { decrypt } from '@orh/crypto'
import { OrhError } from '@orh/shared'

/**
 * Canva connector (Canva Connect API).
 *
 * Dùng cho pipeline "Agent → Canva Autofill → Content Studio":
 * 1. OAuth 2.0 + PKCE tại www.canva.com/api/oauth/authorize
 * 2. POST api.canva.com/rest/v1/oauth/token → access token (+ refresh token)
 * 3. GET /brand-templates → user chọn mẫu đã thiết kế sẵn trong Canva
 * 4. GET /brand-templates/{id}/dataset → biết các trường điền được
 * 5. POST /autofills → điền dữ liệu kịch bản vào mẫu → design mới
 * 6. POST /exports → xuất PNG/MP4 → URL tải về → đẩy vào Content Studio
 *
 * GIỚI HẠN QUAN TRỌNG (đã xác minh từ tài liệu Canva):
 * - Canva KHÔNG có endpoint "gửi prompt text → AI tự sinh video/hình".
 *   AI tạo ảnh/video chỉ chạy bên trong app Canva, không mở API.
 * - Autofill yêu cầu Brand Template — theo tài liệu Canva là tính năng
 *   Enterprise; tài khoản Pro có thể không liệt kê được template.
 * Khi đó pipeline dừng ở mức: kết nối + liệt kê/xuất design có sẵn.
 *
 * Env: CANVA_CLIENT_ID, CANVA_CLIENT_SECRET (tạo trong Canva Developer Portal).
 * Redirect URI đăng ký: https://<api>/auth/canva/callback
 */

export const CANVA_MANIFEST: PermissionManifest = {
  provider: 'canva',
  reviewStatus: 'pending_review',
  requiredForMvp: false,
  scopes: [
    { scope: 'design:content:read', purpose: 'Đọc nội dung thiết kế để xuất file', dataRetentionDays: 0, sensitivityLevel: 'basic' },
    { scope: 'design:content:write', purpose: 'Tạo thiết kế từ autofill', dataRetentionDays: 0, sensitivityLevel: 'sensitive' },
    { scope: 'design:meta:read', purpose: 'Liệt kê thiết kế của bạn', dataRetentionDays: 0, sensitivityLevel: 'basic' },
    { scope: 'asset:read', purpose: 'Đọc asset đã tải lên', dataRetentionDays: 0, sensitivityLevel: 'basic' },
    { scope: 'asset:write', purpose: 'Tải asset lên khi cần', dataRetentionDays: 0, sensitivityLevel: 'sensitive' },
    { scope: 'brandtemplate:meta:read', purpose: 'Liệt kê brand template để chọn mẫu autofill', dataRetentionDays: 0, sensitivityLevel: 'basic' },
    { scope: 'brandtemplate:content:read', purpose: 'Đọc các trường điền được của mẫu', dataRetentionDays: 0, sensitivityLevel: 'basic' },
    { scope: 'brandtemplate:content:write', purpose: 'Điền dữ liệu kịch bản vào mẫu (autofill)', dataRetentionDays: 0, sensitivityLevel: 'sensitive' },
  ],
  notes: 'Autofill cần Brand Template (tài liệu Canva: tính năng Enterprise). Tài khoản Pro có thể không dùng được autofill — khi đó chỉ dùng được liệt kê/xuất thiết kế có sẵn.',
}

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize'
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
const CANVA_API_BASE = 'https://api.canva.com/rest/v1'
const CANVA_REVOKE_URL = 'https://api.canva.com/rest/v1/oauth/revoke'
const ALLOWED_REDIRECT_URIS = [`${process.env.API_URL}/auth/canva/callback`]
const DEFAULT_SCOPES = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read',
  'asset:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'brandtemplate:content:write',
]

export interface CanvaBrandTemplate {
  id: string
  title: string
  thumbnailUrl?: string
}

export interface CanvaDatasetField {
  name: string
  type: string
}

async function canvaFetch(connection: Connection, path: string, init?: RequestInit): Promise<any> {
  const token = decrypt(connection.encryptedAccessToken)
  const res = await fetch(`${CANVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new OrhError('TOKEN_EXPIRED', 'Canva token hết hạn hoặc bị thu hồi.', true, 'canva')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new OrhError('TRANSIENT_NETWORK_ERROR', `Canva API lỗi ${res.status}: ${body.slice(0, 300)}`, res.status >= 500, 'canva')
  }
  return res.json()
}

export class CanvaConnector implements SocialConnector {
  provider(): Provider { return 'canva' }
  manifest(): PermissionManifest { return CANVA_MANIFEST }

  authorizationUrl(input: OAuthStartInput & { codeChallenge: string }): string {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    // Canva bắt buộc PKCE (S256)
    return buildOAuthUrl(CANVA_AUTH_URL, {
      clientId: requiredEnv('canva', 'CANVA_CLIENT_ID'),
      redirectUri: input.redirectUri,
      scopes: input.scopes ?? DEFAULT_SCOPES,
      state: input.state,
      codeChallenge: input.codeChallenge,
    })
  }

  async exchangeCode(input: OAuthCallbackInput): Promise<TokenSet> {
    validateRedirectUri(input.redirectUri, ALLOWED_REDIRECT_URIS)
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      client_id: requiredEnv('canva', 'CANVA_CLIENT_ID'),
      client_secret: requiredEnv('canva', 'CANVA_CLIENT_SECRET'),
    })
    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new OrhError('TRANSIENT_NETWORK_ERROR', `Canva token exchange failed (${res.status}): ${t.slice(0, 200)}`, true, 'canva')
    }
    const d = await res.json()
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000),
      scopes: (d.scope ?? '').split(' ').filter(Boolean),
      tokenType: d.token_type ?? 'Bearer',
    }
  }

  async refresh(connection: Connection): Promise<TokenSet> {
    const refreshToken = connection.encryptedRefreshToken ? decrypt(connection.encryptedRefreshToken) : undefined
    if (!refreshToken) throw new OrhError('TOKEN_EXPIRED', 'Canva không có refresh token, cần kết nối lại.', false, 'canva')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: requiredEnv('canva', 'CANVA_CLIENT_ID'),
      client_secret: requiredEnv('canva', 'CANVA_CLIENT_SECRET'),
    })
    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new OrhError('TOKEN_EXPIRED', 'Canva refresh token thất bại, cần kết nối lại.', false, 'canva')
    const d = await res.json()
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000),
      scopes: (d.scope ?? '').split(' ').filter(Boolean),
      tokenType: d.token_type ?? 'Bearer',
    }
  }

  async getIdentity(connection: Connection): Promise<ProviderIdentity> {
    const d = await canvaFetch(connection, '/users/me')
    return {
      providerUserId: d.id ?? d.user_id ?? 'canva-user',
      displayName: d.display_name ?? 'Canva User',
    }
  }

  async revoke(connection: Connection): Promise<void> {
    try {
      const token = decrypt(connection.encryptedAccessToken)
      await fetch(CANVA_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token,
          client_id: requiredEnv('canva', 'CANVA_CLIENT_ID'),
          client_secret: requiredEnv('canva', 'CANVA_CLIENT_SECRET'),
        }).toString(),
      })
    } catch {
      // revoke best-effort: token hết hạn phía Canva cũng coi như xong
    }
  }

  // ─── Brand templates & autofill ──────────────────────────────────────────

  async listBrandTemplates(connection: Connection): Promise<CanvaBrandTemplate[]> {
    const d = await canvaFetch(connection, '/brand-templates')
    const items = d.items ?? []
    return items.map((t: any) => ({
      id: t.id,
      title: t.title ?? t.name ?? t.id,
      thumbnailUrl: t.thumbnail?.url,
    }))
  }

  async getTemplateDataset(connection: Connection, templateId: string): Promise<CanvaDatasetField[]> {
    const d = await canvaFetch(connection, `/brand-templates/${templateId}/dataset`)
    // Dataset trả về dạng { field_name: { type, ... } } hoặc mảng
    if (Array.isArray(d)) return d.map((f: any) => ({ name: f.name ?? f.key, type: f.type ?? 'text' }))
    const fields = d.fields ?? d.dataset ?? d
    if (fields && typeof fields === 'object') {
      return Object.entries(fields).map(([name, meta]: [string, any]) => ({
        name,
        type: meta?.type ?? 'text',
      }))
    }
    return []
  }

  /** Tạo autofill job: điền data vào brand template → trả về job id. */
  async createAutofill(connection: Connection, brandTemplateId: string, data: Record<string, string>): Promise<string> {
    const d = await canvaFetch(connection, '/autofills', {
      method: 'POST',
      body: JSON.stringify({ brand_template_id: brandTemplateId, data }),
    })
    const jobId = d.job?.id ?? d.id
    if (!jobId) throw new OrhError('CONTENT_REJECTED', 'Canva không trả về autofill job id.', true, 'canva')
    return jobId
  }

  /** Poll autofill job → khi xong trả về design id mới. */
  async waitAutofill(connection: Connection, jobId: string, timeoutMs = 120000): Promise<string> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const d = await canvaFetch(connection, `/autofills/${jobId}`)
      const job = d.job ?? d
      if (job.status === 'success') {
        const designId = job.result?.design_id ?? job.design_id
        if (!designId) throw new OrhError('CONTENT_REJECTED', 'Autofill xong nhưng không có design id.', false, 'canva')
        return designId
      }
      if (job.status === 'failed') {
        throw new OrhError('CONTENT_REJECTED', `Canva autofill thất bại: ${JSON.stringify(job.error ?? job).slice(0, 300)}`, false, 'canva')
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Canva autofill quá thời gian chờ (120s).', true, 'canva')
  }

  /** Tạo export job cho design → trả về job id. */
  async createExport(connection: Connection, designId: string, format: 'png' | 'jpg' | 'mp4' | 'gif' = 'png'): Promise<string> {
    const d = await canvaFetch(connection, '/exports', {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format: { type: format } }),
    })
    const jobId = d.job?.id ?? d.id
    if (!jobId) throw new OrhError('CONTENT_REJECTED', 'Canva không trả về export job id.', true, 'canva')
    return jobId
  }

  /** Poll export job → khi xong trả về URL tải file (hết hạn sau ~24h). */
  async waitExport(connection: Connection, jobId: string, timeoutMs = 180000): Promise<string[]> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const d = await canvaFetch(connection, `/exports/${jobId}`)
      const job = d.job ?? d
      if (job.status === 'success') {
        const urls: string[] = job.urls ?? []
        if (!urls.length) throw new OrhError('CONTENT_REJECTED', 'Export xong nhưng không có URL tải về.', false, 'canva')
        return urls
      }
      if (job.status === 'failed') {
        throw new OrhError('CONTENT_REJECTED', `Canva export thất bại: ${JSON.stringify(job.error ?? job).slice(0, 300)}`, false, 'canva')
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new OrhError('TRANSIENT_NETWORK_ERROR', 'Canva export quá thời gian chờ (180s).', true, 'canva')
  }
}
