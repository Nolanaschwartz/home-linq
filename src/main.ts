import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import type { Request } from 'express';
import { AppModule } from './app.module';

type RawBodyRequest = Request & { rawBody?: Buffer };

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Capture raw body for HMAC signature verification on webhooks.
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = Buffer.from(buf);
      },
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`home-linq listening on :${port}`);
}

bootstrap();
