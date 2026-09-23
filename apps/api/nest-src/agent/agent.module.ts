import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AiModule } from '../ai/ai.module'
import { RagModule } from '../rag/rag.module'
import { RenderModule } from '../render/render.module'

@Module({
  imports: [AiModule, RagModule, RenderModule], // AiService (key) + RagService (knowledge_search) + RenderService (render_video)
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
