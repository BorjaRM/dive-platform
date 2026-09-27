import { Module } from '@nestjs/common';
import { IdentityWebhookController } from './identity-webhook.controller.js';

@Module({
  controllers: [IdentityWebhookController],
})
export class IdentityWebhookModule {}
