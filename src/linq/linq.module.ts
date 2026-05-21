import { Module } from '@nestjs/common';
import { LinqService } from './linq.service';

@Module({
  providers: [LinqService],
  exports: [LinqService],
})
export class LinqModule {}
