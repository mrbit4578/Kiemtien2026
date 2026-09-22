import { Module } from '@nestjs/common'
import { ContentController } from './content.controller'
import { PublishWorkerService } from './publish-worker.service'

@Module({
  controllers: [ContentController],
  providers: [PublishWorkerService],
})
export class ContentModule {}
