import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_MAX = 1024;
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EventDedupe implements OnApplicationBootstrap {
  private readonly log = new Logger(EventDedupe.name);
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_MS);
    try {
      const { count } = await this.prisma.processedEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) this.log.log(`pruned ${count} processed-event rows older than 24h`);
    } catch (err) {
      this.log.warn(`prune failed: ${(err as Error).message}`);
    }
  }

  /** Returns true if this id is new and was recorded; false if already seen. */
  async add(id: string): Promise<boolean> {
    if (this.seen.has(id)) return false;
    try {
      await this.prisma.processedEvent.create({ data: { eventId: id } });
    } catch (err) {
      // Unique constraint violation (P2002) means already processed by another in-flight request.
      if ((err as { code?: string }).code === 'P2002') {
        this.rememberInCache(id);
        return false;
      }
      throw err;
    }
    this.rememberInCache(id);
    return true;
  }

  private rememberInCache(id: string): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > CACHE_MAX) {
      const evicted = this.order.shift();
      if (evicted) this.seen.delete(evicted);
    }
  }
}
