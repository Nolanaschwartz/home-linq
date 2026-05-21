import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { LinqSignatureGuard } from './signature.guard';

const SECRET = 'test-secret';

function buildCtx(opts: {
  signature?: string;
  timestamp?: string;
  rawBody?: Buffer;
}): ExecutionContext {
  const headers: Record<string, string> = {};
  if (opts.signature) headers['x-webhook-signature'] = opts.signature;
  if (opts.timestamp) headers['x-webhook-timestamp'] = opts.timestamp;

  const req = {
    header: (name: string) => headers[name.toLowerCase()],
    rawBody: opts.rawBody,
  };

  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function sign(timestamp: string, body: Buffer): string {
  return createHmac('sha256', SECRET)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
    .digest('hex');
}

function makeGuard(): LinqSignatureGuard {
  const config = {
    get: (key: string) => (key === 'LINQ_WEBHOOK_SECRET' ? SECRET : undefined),
  } as unknown as ConfigService;
  return new LinqSignatureGuard(config);
}

describe('LinqSignatureGuard', () => {
  const body = Buffer.from('{"hello":"world"}', 'utf8');

  it('accepts a valid signature', () => {
    const guard = makeGuard();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(ts, body);
    expect(guard.canActivate(buildCtx({ signature: sig, timestamp: ts, rawBody: body }))).toBe(
      true,
    );
  });

  it('rejects a tampered body', () => {
    const guard = makeGuard();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(ts, body);
    const tampered = Buffer.from('{"hello":"there"}', 'utf8');
    expect(() =>
      guard.canActivate(buildCtx({ signature: sig, timestamp: ts, rawBody: tampered })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a stale timestamp', () => {
    const guard = makeGuard();
    const oldTs = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 minutes ago
    const sig = sign(oldTs, body);
    expect(() =>
      guard.canActivate(buildCtx({ signature: sig, timestamp: oldTs, rawBody: body })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects missing signature', () => {
    const guard = makeGuard();
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => guard.canActivate(buildCtx({ timestamp: ts, rawBody: body }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects missing timestamp', () => {
    const guard = makeGuard();
    expect(() => guard.canActivate(buildCtx({ signature: 'sig', rawBody: body }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects missing rawBody', () => {
    const guard = makeGuard();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(ts, body);
    expect(() => guard.canActivate(buildCtx({ signature: sig, timestamp: ts }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects non-numeric timestamp', () => {
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(buildCtx({ signature: 'sig', timestamp: 'banana', rawBody: body })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a signature of different length without timing-leak', () => {
    const guard = makeGuard();
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() =>
      guard.canActivate(buildCtx({ signature: 'short', timestamp: ts, rawBody: body })),
    ).toThrow(UnauthorizedException);
  });
});
