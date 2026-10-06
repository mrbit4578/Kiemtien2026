import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { TinyFishService } from './tinyfish.service'
import { ChatHistoryController } from './chat-history.controller'
import { ChatHistoryService } from './chat-history.service'

@Module({
  controllers: [AiController, ChatHistoryController],
  providers: [AiService, TinyFishService, ChatHistoryService],
  exports: [AiService, TinyFishService],
})
export class AiModule {}
