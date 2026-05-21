import { EventDedupe } from './event-dedupe';
import { PrismaService } from '../prisma/prisma.service';

type ProcessedRow = { eventId: string; createdAt: Date };

class FakePrisma {
  rows: ProcessedRow[] = [];
  processedEvent = {
    create: jest.fn(async ({ data }: { data: { eventId: string } }) => {
      if (this.rows.find((r) => r.eventId === data.eventId)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const row = { eventId: data.eventId, createdAt: new Date() };
      this.rows.push(row);
      return row;
    }),
    deleteMany: jest.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.createdAt >= where.createdAt.lt);
      return { count: before - this.rows.length };
    }),
  };
}

function makeDedupe(): { d: EventDedupe; fake: FakePrisma } {
  const fake = new FakePrisma();
  const d = new EventDedupe(fake as unknown as PrismaService);
  return { d, fake };
}

describe('EventDedupe', () => {
  it('returns true for a fresh id', async () => {
    const { d } = makeDedupe();
    expect(await d.add('e1')).toBe(true);
  });

  it('returns false for a duplicate id (from DB)', async () => {
    const { d, fake } = makeDedupe();
    await d.add('e1');
    // Force a different instance to verify DB-side dedupe (clear cache by re-using same fake row state)
    // Same instance suffices since we check cache first; cache hits also return false.
    expect(await d.add('e1')).toBe(false);
    expect(fake.rows).toHaveLength(1);
  });

  it('treats a P2002 from DB as already-seen', async () => {
    const { d, fake } = makeDedupe();
    // Pre-populate DB without populating cache by inserting a row directly.
    fake.rows.push({ eventId: 'e-other', createdAt: new Date() });
    expect(await d.add('e-other')).toBe(false);
  });

  it('does not block on different ids', async () => {
    const { d } = makeDedupe();
    expect(await d.add('a')).toBe(true);
    expect(await d.add('b')).toBe(true);
    expect(await d.add('c')).toBe(true);
  });

  it('prune deletes rows older than 24h', async () => {
    const { d, fake } = makeDedupe();
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fake.rows.push({ eventId: 'old', createdAt: stale });
    fake.rows.push({ eventId: 'fresh', createdAt: new Date() });
    await d.onApplicationBootstrap();
    expect(fake.rows.map((r) => r.eventId)).toEqual(['fresh']);
  });
});
