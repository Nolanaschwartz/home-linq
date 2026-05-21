import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DockhandService } from './dockhand.service';

@Module({
  imports: [HttpModule],
  providers: [DockhandService],
  exports: [DockhandService],
})
export class DockhandModule {}
