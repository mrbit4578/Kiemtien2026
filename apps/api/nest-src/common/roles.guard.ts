import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { ROLES_KEY, WorkspaceRole } from './roles.decorator'
import { requireWorkspaceId } from './session'

/**
 * RBAC theo role trong workspace.
 *
 * - Endpoint không gắn @Roles(...) → cho qua (không đổi hành vi cũ).
 * - Endpoint có @Roles(...) → lấy role của user từ WorkspaceMember
 *   (fallback: Workspace.ownerId được coi là 'owner' kể cả khi chưa có row
 *   trong WorkspaceMember) và yêu cầu role nằm trong danh sách cho phép.
 * - Không có session/userId → 401; có session nhưng sai role → 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<WorkspaceRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest()
    const session = req.session
    const workspaceId = requireWorkspaceId(session) // 401 nếu thiếu workspace
    const userId = session?.userId
    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('Thiếu thông tin user trong session. Hãy đăng nhập lại.')
    }

    // @@unique([workspaceId, userId]) → where dùng khóa workspaceId_userId
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })

    let role: string | undefined = membership?.role
    if (!role) {
      // Workspace tạo trước khi có bảng member, hoặc owner chưa có row:
      // ownerId của workspace luôn được coi là 'owner'.
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { ownerId: true },
      })
      if (ws && ws.ownerId === userId) role = 'owner'
    }

    if (!role || !required.includes(role as WorkspaceRole)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này.')
    }
    return true
  }
}
