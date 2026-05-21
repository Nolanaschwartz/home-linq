import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { LinqModule } from './linq/linq.module';
import { DockhandModule } from './dockhand/dockhand.module';
import { AgentModule } from './agent/agent.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    LinqModule,
    DockhandModule,
    AgentModule,
    WebhooksModule,
  ],
})
export class AppModule {}
