import { Module } from '@nestjs/common'
import { ContentController } from './content.controller'
import { PublishWorkerService } from './publish-worker.service'
import { PublishWebhookService } from './publish-webhook.service'

@Module({
  controllers: [ContentController],
  providers: [PublishWorkerService, PublishWebhookService],
})
export class ContentModule {}
