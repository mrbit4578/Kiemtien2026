import { UnauthorizedException } from '@nestjs/common'

/** Lấy workspaceId từ session; fail-closed nếu thiếu. */
export function requireWorkspaceId(session: any): string {
  const id = session?.workspaceId
  if (!id || typeof id !== 'string') {
    throw new UnauthorizedException('Thiếu workspace trong session. Hãy đăng nhập lại.')
  }
  return id
}
