import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { OAuthNotConfiguredError } from '@orh/connectors'
import { createHash } from 'crypto'
import * as bcrypt from 'bcryptjs'
import {
  generatePkce,
  createOAuthState,
  validateOAuthState,
  validateRedirectUri,
} from '@orh/auth'
import { encrypt } from '@orh/crypto'
import type { Provider } from '@orh/shared'
import { CURRENT_POLICY_VERSION, isConsentRequired } from '@orh/policy'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getConnector } from '../common/provider-registry'
import type { RegisterDto, LoginDto } from './dto'

/**
 * Hash email chuẩn hóa (lowercase + trim) — dùng chung cho register/login/OAuth
 * để 1 email luôn ánh xạ tới 1 user duy nhất. KHÔNG lưu email plaintext (privacy).
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

// Hash giả cho dummy compare — chống timing attack khi user không tồn tại.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', 12)

/** Message lỗi chung cho login — không lộ user có tồn tại hay không. */
const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không đúng.'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private callbackUrl(providerName: string): string {
    const apiUrl = process.env.API_URL
    if (!apiUrl) throw new InternalServerErrorException('API_URL chưa được cấu hình.')
    return `${apiUrl}/auth/${providerName}/callback`
  }

  async startOAuth(providerName: string, session: Record<string, any>, ip?: string) {
    const connector = getConnector(providerName)

    const workspaceId = session?.workspaceId
    if (!workspaceId) throw new BadRequestException('Session không hợp lệ: thiếu workspaceId.')

    const { codeVerifier, codeChallenge } = generatePkce()
    const redirectUri = this.callbackUrl(providerName)
    const oauthState = createOAuthState({
      workspaceId,
      provider: providerName,
      codeVerifier,
      redirectUri,
    })

    // Lưu vào session (server-side, HttpOnly cookie)
    session.oauthPending = oauthState
    // KHÔNG log codeVerifier hay state.value

    let url: string
    try {
      url = connector.authorizationUrl({
        workspaceId,
        redirectUri,
        codeChallenge,
        state: oauthState.value,
      })
    } catch (e) {
      // OAuth chưa cấu hình trên server → 503 với message rõ ràng, thay vì
      // redirect user sang provider với client_id=undefined.
      if (e instanceof OAuthNotConfiguredError) throw new ServiceUnavailableException(e.message)
      throw e
    }

    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'oauth_start',
      provider: providerName,
      entityType: 'oauth',
      result: 'success',
      ip,
    })

    return { url }
  }

  async handleCallback(
    providerName: string,
    code: string,
    receivedState: string,
    session: Record<string, any>,
    ip?: string,
  ) {
    const connector = getConnector(providerName)

    const pending = session?.oauthPending
    if (!pending) throw new BadRequestException('Không tìm thấy OAuth session.')
    const workspaceId: string = pending.workspaceId

    const fail = async (err: unknown): Promise<never> => {
      if (session) delete session.oauthPending
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'oauth_callback',
        provider: providerName,
        entityType: 'oauth',
        result: 'failure',
        // KHÔNG log code/state/token — chỉ message
        metadata: { error: err instanceof Error ? err.message : 'unknown' },
        ip,
      })
      throw err
    }

    try {
      // 1. Kiểm tra state (CSRF) + TTL
      try {
        validateOAuthState(pending, receivedState)
      } catch {
        throw new BadRequestException('State không hợp lệ hoặc đã hết hạn (CSRF?).')
      }

      // 2. Kiểm tra redirect URI nằm trong allowlist
      try {
        validateRedirectUri(pending.redirectUri, [this.callbackUrl(providerName)])
      } catch {
        throw new BadRequestException('Redirect URI không hợp lệ.')
      }

      // 3. Đổi code lấy token (PKCE)
      let tokenSet
      try {
        tokenSet = await connector.exchangeCode({
          code,
          state: receivedState,
          redirectUri: pending.redirectUri,
          codeVerifier: pending.codeVerifier,
        })
      } catch (e) {
        if (e instanceof OAuthNotConfiguredError) throw new ServiceUnavailableException(e.message)
        // Hiện lý do thật từ provider để chẩn đoán (đã được connector làm sạch, không chứa secret)
        const detail = e instanceof Error ? e.message : 'unknown'
        throw new BadRequestException(`Đổi code lấy token thất bại (${providerName}): ${detail}`)
      }

      // 4. Mã hóa token trước khi lưu — KHÔNG bao giờ lưu plaintext
      let encryptedAccess: string
      let encryptedRefresh: string | undefined
      try {
        encryptedAccess = encrypt(tokenSet.accessToken)
        encryptedRefresh = tokenSet.refreshToken ? encrypt(tokenSet.refreshToken) : undefined
      } catch {
        throw new InternalServerErrorException(
          'Lỗi mã hóa token: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.',
        )
      }

      // 5. Lấy identity tối thiểu để xác minh connection
      const identity = await connector.getIdentity({
        id: 'pending',
        workspaceId,
        provider: providerName as Provider,
        providerUserId: 'pending',
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        expiresAt: tokenSet.expiresAt,
        scopesJson: tokenSet.scopes,
        status: 'active',
        createdAt: new Date(),
      })

      // 6. Định danh user bằng hash (không lưu email plaintext)
      // Email thật → hash chuẩn hóa; fallback synthetic id → hash thô (giữ nguyên case của providerUserId)
      const rawIdentity = identity.email ?? `${providerName}:${identity.providerUserId}`
      const emailHash = identity.email
        ? hashEmail(rawIdentity)
        : createHash('sha256').update(rawIdentity).digest('hex')
      const user = await this.prisma.user.upsert({
        where: { emailHash },
        create: { emailHash, displayName: identity.displayName },
        update: { displayName: identity.displayName },
      })

      await this.prisma.workspace.upsert({
        where: { id: workspaceId },
        create: {
          id: workspaceId,
          ownerId: user.id,
          name: `Workspace của ${identity.displayName}`,
        },
        update: {},
      })

      // 7. Consent: ghi nhận grant. Chỉ tạo record mới khi cần
      //    (scope mới / policy đổi version / consent cũ đã revoke)
      const latest = await this.prisma.consent.findFirst({
        where: { userId: user.id, provider: providerName, revokedAt: null },
        orderBy: { grantedAt: 'desc' },
      })
      const existing = latest
        ? { ...latest, provider: latest.provider as Provider, revokedAt: latest.revokedAt ?? undefined }
        : undefined
      if (isConsentRequired(existing, tokenSet.scopes)) {
        await this.prisma.consent.create({
          data: {
            userId: user.id,
            provider: providerName,
            purpose: 'oauth_connect',
            scopesJson: tokenSet.scopes,
            policyVersion: CURRENT_POLICY_VERSION,
            ipHash: createHash('sha256').update(ip ?? 'unknown').digest('hex'),
          },
        })
      }

      // 8. Lưu connection (upsert theo workspace + provider + providerUserId)
      const connection = await this.prisma.connection.upsert({
        where: {
          workspaceId_provider_providerUserId: {
            workspaceId,
            provider: providerName,
            providerUserId: identity.providerUserId,
          },
        },
        create: {
          workspaceId,
          provider: providerName,
          providerUserId: identity.providerUserId,
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh,
          expiresAt: tokenSet.expiresAt,
          scopesJson: tokenSet.scopes,
          status: 'active',
        },
        update: {
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh,
          expiresAt: tokenSet.expiresAt,
          scopesJson: tokenSet.scopes,
          status: 'active',
          lastError: null,
        },
      })

      delete session.oauthPending

      await this.audit.log({
        workspaceId,
        actorId: user.id,
        action: 'oauth_connected',
        provider: providerName,
        entityType: 'connection',
        targetId: connection.id,
        result: 'success',
        metadata: { scopes: tokenSet.scopes },
        ip,
      })

      return {
        connectionId: connection.id,
        providerUserId: identity.providerUserId,
        displayName: identity.displayName,
      }
    } catch (err) {
      return fail(err)
    }
  }

  // ─── Tài khoản email/password ────────────────────────────────────────────

  private toUserDto(user: { id: string; displayName: string }, email?: string) {
    // Lưu ý privacy: email plaintext KHÔNG lưu trong DB — chỉ echo lại email
    // vừa nhập ở request hiện tại để frontend hiển thị.
    return { id: user.id, name: user.displayName, email: email ?? null }
  }

  private toWorkspaceDto(workspace: { id: string; name: string; plan: string }) {
    return { id: workspace.id, name: workspace.name, plan: workspace.plan }
  }

  /** POST /auth/register — tạo User + Workspace + membership owner trong 1 transaction. */
  async register(dto: RegisterDto, session: Record<string, any>, ip?: string) {
    const email = dto.email.trim().toLowerCase()
    const emailHash = hashEmail(email)

    const existing = await this.prisma.user.findUnique({ where: { emailHash } })
    if (existing) {
      // Không audit ở đây: chưa có workspace hợp lệ để gắn (AuditLog.workspaceId có FK).
      throw new ConflictException('Email này đã được đăng ký. Hãy đăng nhập.')
    }

    // KHÔNG bao giờ log password — chỉ hash bcrypt (cost 12)
    const passwordHash = await bcrypt.hash(dto.password, 12)
    const displayName = dto.name?.trim() || email.split('@')[0]

    const { user, workspace } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { emailHash, displayName, passwordHash } })
      const w = await tx.workspace.create({
        data: { ownerId: u.id, name: `Workspace của ${displayName}` },
      })
      await tx.workspaceMember.create({
        data: { workspaceId: w.id, userId: u.id, role: 'owner' },
      })
      return { user: u, workspace: w }
    })

    session.userId = user.id
    session.workspaceId = workspace.id

    await this.audit.log({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'user_register',
      entityType: 'user',
      targetId: user.id,
      result: 'success',
      ip,
    })

    return {
      user: this.toUserDto(user, email),
      workspace: this.toWorkspaceDto(workspace),
    }
  }

  /** POST /auth/login — verify bcrypt; message lỗi chung để chống user enumeration. */
  async login(dto: LoginDto, session: Record<string, any>, ip?: string) {
    const email = dto.email.trim().toLowerCase()
    const emailHash = hashEmail(email)

    const user = await this.prisma.user.findUnique({ where: { emailHash } })
    // Dummy compare khi user không tồn tại hoặc chưa có password → chống timing attack
    const passwordOk = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH)

    if (!user || !user.passwordHash || !passwordOk) {
      // Audit khi biết workspace của user (nếu có) — không audit khi email lạ
      if (user) {
        const membership = await this.prisma.workspaceMember.findFirst({
          where: { userId: user.id },
        })
        if (membership) {
          await this.audit.log({
            workspaceId: membership.workspaceId,
            actorId: user.id,
            action: 'user_login',
            entityType: 'user',
            result: 'failure',
            metadata: { reason: 'bad_credentials' },
            ip,
          })
        }
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    // Chọn workspace: ưu tiên workspace mà user là owner, rồi mới tới member
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    })
    if (memberships.length === 0) {
      throw new UnauthorizedException('Tài khoản chưa có workspace. Hãy đăng ký lại.')
    }
    memberships.sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1))
    const workspace = memberships[0].workspace

    session.userId = user.id
    session.workspaceId = workspace.id

    await this.audit.log({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'user_login',
      entityType: 'user',
      targetId: user.id,
      result: 'success',
      ip,
    })

    return {
      user: this.toUserDto(user, email),
      workspace: this.toWorkspaceDto(workspace),
    }
  }

  /** POST /auth/logout — ghi audit (gọi sau khi session đã bị destroy). */
  async auditLogout(workspaceId: string, userId: string, ip?: string) {
    await this.audit.log({
      workspaceId,
      actorId: userId,
      action: 'user_logout',
      entityType: 'user',
      targetId: userId,
      result: 'success',
      ip,
    })
  }

  /** GET /auth/session — identity endpoint cho frontend (lấp TODO của SessionContext). */
  async getSession(session: Record<string, any>) {
    const userId = session?.userId
    const workspaceId = session?.workspaceId
    if (!userId || !workspaceId) throw new UnauthorizedException('Chưa đăng nhập.')

    const [user, workspace, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.workspace.findUnique({ where: { id: workspaceId } }),
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      }),
    ])
    if (!user || !workspace || !membership) {
      throw new UnauthorizedException('Phiên làm việc không hợp lệ. Hãy đăng nhập lại.')
    }

    return {
      user: this.toUserDto(user),
      workspace: this.toWorkspaceDto(workspace),
      role: membership.role,
    }
  }
}
