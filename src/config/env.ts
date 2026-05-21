import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),

  LINQ_API_KEY: z.string().min(1),
  LINQ_FROM_NUMBER: z.string().regex(/^\+\d{8,15}$/),
  LINQ_WEBHOOK_SECRET: z.string().min(1),

  DOCKHAND_BASE_URL: z.string().url(),
  DOCKHAND_TOKEN: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_BASE_URL: z.string().url().optional(),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  ALLOWED_SENDERS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().default('file:./dev.db'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
