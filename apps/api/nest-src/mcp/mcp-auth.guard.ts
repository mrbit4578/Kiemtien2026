import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'

/**
 * Guard cho MCP endpoint: xác thực static Bearer token từ env MCP_BEARER_TOKEN.
 * Token này do Naive vault inject phía server khi agent kết nối MCP —
 * agent/model không bao giờ thấy giá trị thật.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest()
    const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
    const expected = process.env.MCP_BEARER_TOKEN ?? ''
    const ok =
      expected.length > 0 &&
      token.length === expected.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    if (!ok) throw new UnauthorizedException('Missing or invalid Bearer token')
    return true
  }
}
