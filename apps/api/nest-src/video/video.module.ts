import { Module } from '@nestjs/common'
import { VideoController } from './video.controller'
import { VideoService } from './video.service'
import { AiModule } from '../ai/ai.module'

@Module({
  imports: [AiModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
