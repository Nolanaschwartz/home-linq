import { Module } from '@nestjs/common';
import { DockhandModule } from '../dockhand/dockhand.module';
import { AgentService } from './agent.service';

@Module({
  imports: [DockhandModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
