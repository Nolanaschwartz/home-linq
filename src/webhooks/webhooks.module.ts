import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { LinqModule } from '../linq/linq.module';
import { EventDedupe } from './event-dedupe';
import { LinqWebhookController } from './linq-webhook.controller';
import { LinqSignatureGuard } from './signature.guard';
import { PendingClears } from './pending-clears';

@Module({
  imports: [AgentModule, LinqModule],
  controllers: [LinqWebhookController],
  providers: [LinqSignatureGuard, EventDedupe, PendingClears],
})
export class WebhooksModule {}
