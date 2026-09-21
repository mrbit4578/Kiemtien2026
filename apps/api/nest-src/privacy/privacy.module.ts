import { Module } from '@nestjs/common'
import { PrivacyController } from './privacy.controller'
import { MeController } from './me.controller'

@Module({ controllers: [PrivacyController, MeController] })
export class PrivacyModule {}
