import { Module } from '@nestjs/common'
import { NicheController } from './niche.controller'
import { NicheService } from './niche.service'

@Module({
  controllers: [NicheController],
  providers: [NicheService],
  exports: [NicheService],
})
export class NicheModule {}
