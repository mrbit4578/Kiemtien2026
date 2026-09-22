import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AiModule } from '../ai/ai.module'
import { RagModule } from '../rag/rag.module'

@Module({
  imports: [AiModule, RagModule], // AiService (key) + RagService (knowledge_search)
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
