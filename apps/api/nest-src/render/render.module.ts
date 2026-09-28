import { Module } from '@nestjs/common'
import { ConcatClient } from './concat-client'
import { RenderService } from './render.service'
import { RenderController } from './render.controller'

@Module({
  controllers: [RenderController],
  providers: [ConcatClient, RenderService],
  exports: [RenderService, ConcatClient],
})
export class RenderModule {}
