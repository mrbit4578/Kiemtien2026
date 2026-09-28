import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { ChatHistoryController } from './chat-history.controller'
import { ChatHistoryService } from './chat-history.service'

@Module({
  controllers: [AiController, ChatHistoryController],
  providers: [AiService, ChatHistoryService],
  exports: [AiService],
})
export class AiModule {}
