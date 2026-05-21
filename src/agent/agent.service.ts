import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreMessage, generateText } from 'ai';
import { DockhandService } from '../dockhand/dockhand.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_PROMPT } from './agent.prompts';
import { buildDockhandTools } from './agent.tools';

const HISTORY_LIMIT = 20;
const HEALTH_TIMEOUT_MS = 5000;

export class AgentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Agent call timed out after ${timeoutMs}ms`);
    this.name = 'AgentTimeoutError';
  }
}

@Injectable()
export class AgentService implements OnApplicationBootstrap {
  private readonly log = new Logger(AgentService.name);
  private openai!: OpenAIProvider;
  private modelName!: string;
  private timeoutMs!: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dockhand: DockhandService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.openai = createOpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      baseURL: this.config.get<string>('OPENAI_BASE_URL'),
    });
    this.modelName = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o';
    this.timeoutMs = this.config.get<number>('AGENT_TIMEOUT_MS') ?? 60000;

    const base = (
      this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
    const url = `${base}/models`;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.log.warn(
          `OpenAI health-ping → ${res.status} ${res.statusText} (${url}). Agent calls will likely fail.`,
        );
        return;
      }
      this.log.log(`OpenAI health-ping OK → ${url}`);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.log.warn(
        `OpenAI health-ping FAILED → ${url}: ${msg}. Agent calls will fail until this is fixed.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async handle(chatId: string, participant: string, userText: string): Promise<string> {
    await this.prisma.chat.upsert({
      where: { id: chatId },
      update: {},
      create: { id: chatId, participant },
    });

    await this.prisma.message.create({
      data: { chatId, role: 'user', content: userText },
    });

    const history = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    history.reverse();

    const messages: CoreMessage[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    let result;
    try {
      result = await generateText({
        model: this.openai(this.modelName),
        system: SYSTEM_PROMPT,
        messages,
        tools: buildDockhandTools(this.dockhand),
        maxSteps: 8,
        abortSignal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted) {
        throw new AgentTimeoutError(this.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const reply = result.text.trim() || '(no reply)';

    await this.prisma.message.create({
      data: { chatId, role: 'assistant', content: reply },
    });

    this.log.log(
      `chat=${chatId} steps=${result.steps?.length ?? 1} reply.len=${reply.length}`,
    );

    return reply;
  }
}
