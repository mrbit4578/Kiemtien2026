import { SetMetadata } from '@nestjs/common'

/** Role trong workspace — khớp cột `role` của model WorkspaceMember (schema.prisma). */
export type WorkspaceRole = 'owner' | 'admin' | 'member'

export const ROLES_KEY = 'orh:roles'

/**
 * Gắn role được phép vào endpoint, ví dụ: @Roles('owner', 'admin').
 * Endpoint không gắn @Roles → RolesGuard cho qua (giữ nguyên hành vi cũ).
 */
export const Roles = (...roles: WorkspaceRole[]) => SetMetadata(ROLES_KEY, roles)
