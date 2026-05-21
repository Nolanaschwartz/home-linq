import { PendingClears } from './pending-clears';
import { PrismaService } from '../prisma/prisma.service';

type Row = { confirmationMessageId: string; chatId: string; createdAt: Date };

class FakePrisma {
  rows: Row[] = [];
  pendingClear = {
    upsert: jest.fn(
      async ({
        where,
        update,
        create,
      }: {
        where: { chatId: string };
        update: { confirmationMessageId: string; createdAt: Date };
        create: { confirmationMessageId: string; chatId: string };
      }) => {
        const existing = this.rows.find((r) => r.chatId === where.chatId);
        if (existing) {
          existing.confirmationMessageId = update.confirmationMessageId;
          existing.createdAt = update.createdAt;
          return existing;
        }
        const row = { ...create, createdAt: new Date() };
        this.rows.push(row);
        return row;
      },
    ),
    findUnique: jest.fn(
      async ({
        where,
      }: {
        where: { chatId?: string; confirmationMessageId?: string };
      }) => {
        if (where.chatId) return this.rows.find((r) => r.chatId === where.chatId) ?? null;
        if (where.confirmationMessageId)
          return (
            this.rows.find((r) => r.confirmationMessageId === where.confirmationMessageId) ?? null
          );
        return null;
      },
    ),
    delete: jest.fn(
      async ({
        where,
      }: {
        where: { chatId?: string; confirmationMessageId?: string };
      }) => {
        const idx = this.rows.findIndex(
          (r) =>
            (where.chatId && r.chatId === where.chatId) ||
            (where.confirmationMessageId &&
              r.confirmationMessageId === where.confirmationMessageId),
        );
        if (idx === -1) throw new Error('Not found');
        const [row] = this.rows.splice(idx, 1);
        return row;
      },
    ),
    deleteMany: jest.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.createdAt >= where.createdAt.lt);
      return { count: before - this.rows.length };
    }),
  };
}

function make(): { p: PendingClears; fake: FakePrisma } {
  const fake = new FakePrisma();
  const p = new PendingClears(fake as unknown as PrismaService);
  return { p, fake };
}

describe('PendingClears', () => {
  it('register + hasPendingForChat', async () => {
    const { p } = make();
    await p.register('msg-1', 'chat-1');
    expect(await p.hasPendingForChat('chat-1')).toBe(true);
    expect(await p.hasPendingForChat('other-chat')).toBe(false);
  });

  it('consumeByMessageId returns chatId and removes row', async () => {
    const { p, fake } = make();
    await p.register('msg-1', 'chat-1');
    expect(await p.consumeByMessageId('msg-1')).toBe('chat-1');
    expect(fake.rows).toHaveLength(0);
    expect(await p.hasPendingForChat('chat-1')).toBe(false);
  });

  it('consumeByChatId returns chatId and removes row', async () => {
    const { p, fake } = make();
    await p.register('msg-1', 'chat-1');
    expect(await p.consumeByChatId('chat-1')).toBe('chat-1');
    expect(fake.rows).toHaveLength(0);
  });

  it('consumeByMessageId returns undefined for unknown msg', async () => {
    const { p } = make();
    expect(await p.consumeByMessageId('nope')).toBeUndefined();
  });

  it('one pending per chat: re-register replaces prior', async () => {
    const { p, fake } = make();
    await p.register('msg-1', 'chat-1');
    await p.register('msg-2', 'chat-1');
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].confirmationMessageId).toBe('msg-2');
  });

  it('expired entries are not returned (TTL > 10min)', async () => {
    const { p, fake } = make();
    fake.rows.push({
      confirmationMessageId: 'stale-msg',
      chatId: 'stale-chat',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    expect(await p.hasPendingForChat('stale-chat')).toBe(false);
    // hasPendingForChat also evicts
    expect(fake.rows).toHaveLength(0);
  });

  it('expired consumeByMessageId returns undefined and removes', async () => {
    const { p, fake } = make();
    fake.rows.push({
      confirmationMessageId: 'stale-msg',
      chatId: 'stale-chat',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    expect(await p.consumeByMessageId('stale-msg')).toBeUndefined();
    expect(fake.rows).toHaveLength(0);
  });
});
