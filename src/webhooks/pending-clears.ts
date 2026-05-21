import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class PendingClears {
  private readonly log = new Logger(PendingClears.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(confirmationMessageId: string, chatId: string): Promise<void> {
    await this.pruneExpired();
    await this.prisma.pendingClear.upsert({
      where: { chatId },
      update: { confirmationMessageId, createdAt: new Date() },
      create: { confirmationMessageId, chatId },
    });
  }

  async consumeByMessageId(confirmationMessageId: string): Promise<string | undefined> {
    const row = await this.prisma.pendingClear.findUnique({
      where: { confirmationMessageId },
    });
    if (!row) return undefined;
    await this.prisma.pendingClear
      .delete({ where: { confirmationMessageId } })
      .catch(() => undefined);
    if (Date.now() - row.createdAt.getTime() > TTL_MS) return undefined;
    return row.chatId;
  }

  async consumeByChatId(chatId: string): Promise<string | undefined> {
    const row = await this.prisma.pendingClear.findUnique({ where: { chatId } });
    if (!row) return undefined;
    await this.prisma.pendingClear.delete({ where: { chatId } }).catch(() => undefined);
    if (Date.now() - row.createdAt.getTime() > TTL_MS) return undefined;
    return row.chatId;
  }

  async hasPendingForChat(chatId: string): Promise<boolean> {
    const row = await this.prisma.pendingClear.findUnique({ where: { chatId } });
    if (!row) return false;
    if (Date.now() - row.createdAt.getTime() > TTL_MS) {
      await this.prisma.pendingClear.delete({ where: { chatId } }).catch(() => undefined);
      return false;
    }
    return true;
  }

  private async pruneExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - TTL_MS);
    try {
      await this.prisma.pendingClear.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (err) {
      this.log.warn(`prune failed: ${(err as Error).message}`);
    }
  }
}
