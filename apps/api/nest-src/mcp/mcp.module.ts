import { Module } from '@nestjs/common'
import { McpController } from './mcp.controller'
import { McpService } from './mcp.service'
import { McpAuthGuard } from './mcp-auth.guard'
import { VideoModule } from '../video/video.module'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [VideoModule, AiModule],
  controllers: [McpController],
  providers: [McpService, McpAuthGuard],
})
export class McpModule {}
