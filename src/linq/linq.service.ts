import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import LinqAPIV3, { APIError } from '@linqapp/sdk';
import type {
  ChatCreateResponse,
  MessageContent,
} from '@linqapp/sdk/resources/chats/chats';
import type {
  MessageSendResponse,
} from '@linqapp/sdk/resources/chats/messages';
import type {
  WebhookSubscriptionCreateResponse,
} from '@linqapp/sdk/resources/webhook-subscriptions';
import type { WebhookEventType } from '@linqapp/sdk/resources/webhook-events';

@Injectable()
export class LinqService implements OnModuleInit {
  private readonly log = new Logger(LinqService.name);
  private client!: LinqAPIV3;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new LinqAPIV3({
      apiKey: this.config.get<string>('LINQ_API_KEY'),
    });
  }

  private textMessage(text: string): MessageContent {
    return { parts: [{ type: 'text', value: text }] };
  }

  private logApiError(op: string, err: unknown): void {
    if (err instanceof APIError) {
      this.log.error(
        `Linq ${op} → ${err.status ?? 'no-status'} ${err.name}: ${err.message}`,
      );
    } else {
      this.log.error(`Linq ${op} failed: ${(err as Error).message ?? err}`);
    }
  }

  async sendMessage(chatId: string, text: string): Promise<MessageSendResponse> {
    try {
      return await this.client.chats.messages.send(chatId, {
        message: this.textMessage(text),
      });
    } catch (err) {
      this.logApiError(`chats.messages.send chat=${chatId}`, err);
      throw err;
    }
  }

  async createChatAndSend(to: string[], text: string): Promise<ChatCreateResponse> {
    const from = this.config.get<string>('LINQ_FROM_NUMBER')!;
    try {
      return await this.client.chats.create({
        from,
        to,
        message: this.textMessage(text),
      });
    } catch (err) {
      this.logApiError(`chats.create to=${to.join(',')}`, err);
      throw err;
    }
  }

  async startTyping(chatId: string): Promise<void> {
    try {
      await this.client.chats.typing.start(chatId);
      this.log.log(`typing.start chat=${chatId}`);
    } catch (err) {
      this.logApiError(`chats.typing.start chat=${chatId}`, err);
    }
  }

  async stopTyping(chatId: string): Promise<void> {
    try {
      await this.client.chats.typing.stop(chatId);
    } catch (err) {
      this.logApiError(`chats.typing.stop chat=${chatId}`, err);
    }
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    try {
      await this.client.messages.addReaction(messageId, {
        operation: 'add',
        type: 'custom',
        custom_emoji: emoji,
      });
    } catch (err) {
      this.logApiError(`messages.addReaction msg=${messageId} ${emoji}`, err);
    }
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    try {
      await this.client.messages.addReaction(messageId, {
        operation: 'remove',
        type: 'custom',
        custom_emoji: emoji,
      });
    } catch (err) {
      this.logApiError(`messages.removeReaction msg=${messageId} ${emoji}`, err);
    }
  }

  async subscribeWebhook(
    targetUrl: string,
    events: WebhookEventType[],
  ): Promise<WebhookSubscriptionCreateResponse> {
    try {
      const res = await this.client.webhookSubscriptions.create({
        target_url: targetUrl,
        subscribed_events: events,
      });
      this.log.log(`Subscribed Linq webhook → ${targetUrl} (${events.join(',')})`);
      return res;
    } catch (err) {
      this.logApiError(`webhookSubscriptions.create url=${targetUrl}`, err);
      throw err;
    }
  }
}
