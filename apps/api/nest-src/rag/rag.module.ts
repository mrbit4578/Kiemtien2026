import { Module } from '@nestjs/common'
import { RagController } from './rag.controller'
import { RagService } from './rag.service'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [AiModule], // dùng AiService: embed + chat (key giải mã server-side)
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
