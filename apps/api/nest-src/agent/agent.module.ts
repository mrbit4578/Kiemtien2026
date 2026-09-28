import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { AiModule } from '../ai/ai.module'
import { RagModule } from '../rag/rag.module'
import { RenderModule } from '../render/render.module'
import { WooCommerceModule } from '../woocommerce/woocommerce.module'

@Module({
  imports: [AiModule, RagModule, RenderModule, WooCommerceModule], // AiService (key) + RagService (knowledge_search) + RenderService (render_video) + WooCommerceService (woo_products)
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
