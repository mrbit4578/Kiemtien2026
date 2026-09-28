import { Module } from '@nestjs/common'
import { WooCommerceController } from './woocommerce.controller'
import { WooCommerceService } from './woocommerce.service'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'

@Module({
  controllers: [WooCommerceController],
  providers: [WooCommerceService, PrismaService, AuditLogService],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
