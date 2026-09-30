import { Module } from '@nestjs/common'
import { MmoController } from './mmo.controller'
import { MmoService } from './mmo.service'

@Module({
  controllers: [MmoController],
  providers: [MmoService],
  exports: [MmoService],
})
export class MmoModule {}
