import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const MAX_SKEW_SECONDS = 5 * 60;

@Injectable()
export class LinqSignatureGuard implements CanActivate {
  private readonly log = new Logger(LinqSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secret = this.config.get<string>('LINQ_WEBHOOK_SECRET')!;

    const signature = req.header('x-webhook-signature');
    const timestamp = req.header('x-webhook-timestamp');

    if (!signature) {
      this.log.warn('reject: missing X-Webhook-Signature');
      throw new UnauthorizedException('Missing signature');
    }
    if (!timestamp) {
      this.log.warn('reject: missing X-Webhook-Timestamp');
      throw new UnauthorizedException('Missing timestamp');
    }
    if (!req.rawBody) {
      this.log.error('rawBody not available — ensure rawBody capture in main.ts');
      throw new UnauthorizedException('No raw body for signature verification');
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      this.log.warn(`reject: non-numeric timestamp=${timestamp}`);
      throw new UnauthorizedException('Bad timestamp');
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > MAX_SKEW_SECONDS) {
      this.log.warn(`reject: stale timestamp skew=${now - ts}s`);
      throw new UnauthorizedException('Stale timestamp');
    }

    const signed = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      req.rawBody,
    ]);
    const expected = createHmac('sha256', secret).update(signed).digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.log.warn(
        `reject: signature mismatch (body=${req.rawBody.length}B, ts=${timestamp})`,
      );
      throw new UnauthorizedException('Bad signature');
    }

    return true;
  }
}
