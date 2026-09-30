import { Module } from '@nestjs/common'
import { VideogenController } from './videogen.controller'
import { VideogenService } from './videogen.service'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [AiModule],
  controllers: [VideogenController],
  providers: [VideogenService],
  exports: [VideogenService],
})
export class VideogenModule {}
