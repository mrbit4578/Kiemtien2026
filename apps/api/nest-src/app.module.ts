import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ApiKeyGuard } from './common/api-key.guard'
import { PrismaModule } from './prisma/prisma.module'
import { AuditModule } from './audit/audit.module'
import { AuthModule } from './auth/auth.module'
import { ConnectionsModule } from './connections/connections.module'
import { ContentModule } from './content/content.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { PrivacyModule } from './privacy/privacy.module'
import { AiModule } from './ai/ai.module'
import { RagModule } from './rag/rag.module'
import { AgentModule } from './agent/agent.module'
import { CanvaModule } from './canva/canva.module'
import { RenderModule } from './render/render.module'
import { VideoModule } from './video/video.module'

@Module({
  imports: [
    // Rate limit mặc định toàn app: 100 req/phút; endpoint nhạy cảm (auth) siết riêng
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    ConnectionsModule,
    ContentModule,
    AnalyticsModule,
    PrivacyModule,
    AiModule,
    RagModule,
    AgentModule,
    CanvaModule,
    RenderModule,
    VideoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // API key server-to-server (X-API-Key): không header → giữ nguyên flow session.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
