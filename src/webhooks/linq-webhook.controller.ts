import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentService, AgentTimeoutError } from '../agent/agent.service';
import { LinqService } from '../linq/linq.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventDedupe } from './event-dedupe';
import { LinqSignatureGuard } from './signature.guard';
import { PendingClears } from './pending-clears';
import {
  messageReceivedEnvelope,
  reactionAddedEnvelope,
  type MessageReceivedEnvelope,
  type ReactionAddedEnvelope,
} from './linq-webhook.schemas';
import { CLEAR_COMMAND_RE, classifyConfirmation, normalizeEmoji } from './confirmation';

interface LinqWebhookEnvelope {
  event_id?: string;
  event_type?: string;
  data?: unknown;
}

@Controller('webhooks/linq')
export class LinqWebhookController {
  private readonly log = new Logger(LinqWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly agent: AgentService,
    private readonly linq: LinqService,
    private readonly prisma: PrismaService,
    private readonly dedupe: EventDedupe,
    private readonly pendingClears: PendingClears,
  ) {}

  @Post()
  @HttpCode(200)
  @UseGuards(LinqSignatureGuard)
  async handle(@Body() event: LinqWebhookEnvelope): Promise<{ ok: true }> {
    if (event.event_id) {
      const fresh = await this.dedupe.add(event.event_id);
      if (!fresh) {
        this.log.log(`dedupe drop event_id=${event.event_id}`);
        return { ok: true };
      }
    }

    void this.route(event).catch((err) =>
      this.log.error(
        `unhandled error for event_id=${event.event_id}: ${(err as Error).message}`,
      ),
    );

    return { ok: true };
  }

  private async route(event: LinqWebhookEnvelope): Promise<void> {
    this.log.log(`received event_type=${event.event_type ?? 'undefined'} event_id=${event.event_id}`);
    switch (event.event_type) {
      case 'message.received': {
        const parsed = messageReceivedEnvelope.safeParse(event);
        if (!parsed.success) {
          this.log.warn(
            `malformed message.received event_id=${event.event_id}: ${parsed.error.message}`,
          );
          return;
        }
        await this.onMessageReceived(parsed.data);
        return;
      }
      case 'reaction.added': {
        const parsed = reactionAddedEnvelope.safeParse(event);
        if (!parsed.success) {
          this.log.warn(
            `malformed reaction.added event_id=${event.event_id}: ${parsed.error.message}`,
          );
          return;
        }
        await this.onReactionAdded(parsed.data);
        return;
      }
      default:
        this.log.log(`ignored event_type=${event.event_type ?? 'undefined'}`);
    }
  }

  private isAllowed(handle: string | undefined): boolean {
    if (!handle) return false;
    const allowed = this.config.get<string[]>('ALLOWED_SENDERS') ?? [];
    return allowed.length === 0 || allowed.includes(handle);
  }

  private async onMessageReceived(event: MessageReceivedEnvelope): Promise<void> {
    const data = event.data;
    if (!data.sender_handle?.handle) {
      this.log.warn(`malformed payload event_id=${event.event_id}`);
      return;
    }
    if (data.sender_handle.is_me || data.direction === 'outbound') return;

    const sender = data.sender_handle.handle;
    if (!this.isAllowed(sender)) {
      this.log.warn(`rejected sender=${sender}`);
      return;
    }

    const text = (data.parts ?? [])
      .filter((p): p is { type: string; value: string } => p.type === 'text' && typeof p.value === 'string')
      .map((p) => p.value)
      .join('\n')
      .trim();
    if (!text) return;

    const chatId = data.chat.id;
    const messageId = data.id;
    const isGroup = !!data.chat.is_group;

    if (await this.pendingClears.hasPendingForChat(chatId)) {
      const decision = classifyConfirmation(text);
      if (decision === 'confirm') {
        this.log.log(`pending-clear confirmed by text chat=${chatId}`);
        await this.pendingClears.consumeByChatId(chatId);
        await this.linq.addReaction(messageId, '✅');
        await this.executeClear(chatId);
        return;
      }
      if (decision === 'cancel') {
        this.log.log(`pending-clear cancelled by text chat=${chatId}`);
        await this.pendingClears.consumeByChatId(chatId);
        await this.linq.addReaction(messageId, '❌');
        await this.linq.sendMessage(chatId, 'Cancelled.').catch(() => undefined);
        return;
      }
      // Anything else: drop the pending state so the new message proceeds normally.
      this.log.log(`pending-clear superseded by new message chat=${chatId}`);
      await this.pendingClears.consumeByChatId(chatId);
    }

    if (CLEAR_COMMAND_RE.test(text)) {
      this.log.log(`clear command from=${sender} chat=${chatId}`);
      await this.beginClearConfirmation(chatId, messageId);
      return;
    }

    await this.runAgent(chatId, messageId, sender, text, isGroup);
  }

  private async beginClearConfirmation(
    chatId: string,
    userMessageId: string,
  ): Promise<void> {
    await this.linq.addReaction(userMessageId, '👀');
    try {
      const sent = await this.linq.sendMessage(
        chatId,
        'Clear this chat history? React ✅ to confirm or ❌ to cancel.',
      );
      const confirmationId = sent.message?.id;
      if (!confirmationId) {
        this.log.warn(
          `clear: no message id returned for chat=${chatId}, response=${JSON.stringify(sent)}`,
        );
        return;
      }
      await this.pendingClears.register(confirmationId, chatId);
      this.log.log(`clear: registered confirmation msg=${confirmationId} chat=${chatId}`);
      await this.linq.removeReaction(userMessageId, '👀');
      await this.linq.addReaction(userMessageId, '✅');
    } catch (err) {
      this.log.error(`clear-confirm failed for chat=${chatId}`, err as Error);
      await this.linq.removeReaction(userMessageId, '👀');
      await this.linq.addReaction(userMessageId, '❌');
    }
  }

  private async onReactionAdded(event: ReactionAddedEnvelope): Promise<void> {
    const data = event.data;
    if (!data) {
      this.log.warn(`reaction.added: empty data event_id=${event.event_id}`);
      return;
    }
    this.log.log(
      `reaction.added msg=${data.message_id} type=${data.reaction_type} emoji=${data.custom_emoji ?? ''} from=${data.from_handle?.handle ?? data.from} is_from_me=${data.is_from_me}`,
    );

    if (data.is_from_me) return;

    const sender = data.from_handle?.handle ?? data.from;
    if (!this.isAllowed(sender)) {
      this.log.warn(`reaction.added rejected sender=${sender}`);
      return;
    }

    const messageId = data.message_id;
    if (!messageId) return;

    const chatId = await this.pendingClears.consumeByMessageId(messageId);
    if (!chatId) {
      this.log.log(`reaction.added: no pending clear for msg=${messageId}`);
      return;
    }

    if (data.reaction_type !== 'custom') {
      this.log.log(`pending-clear ignored non-custom reaction type=${data.reaction_type}`);
      return;
    }

    const emoji = normalizeEmoji(data.custom_emoji);
    if (emoji === '✅') {
      this.log.log(`pending-clear confirmed chat=${chatId}`);
      await this.executeClear(chatId);
    } else if (emoji === '❌') {
      this.log.log(`pending-clear cancelled chat=${chatId}`);
      await this.linq.sendMessage(chatId, 'Cancelled.').catch(() => undefined);
    } else {
      this.log.log(
        `pending-clear ignored emoji=${data.custom_emoji} bytes=${[...(data.custom_emoji ?? '')].map((c) => c.codePointAt(0)?.toString(16)).join(',')}`,
      );
    }
  }

  private async executeClear(chatId: string): Promise<void> {
    try {
      const result = await this.prisma.message.deleteMany({ where: { chatId } });
      this.log.log(`cleared chat=${chatId} messages=${result.count}`);
      await this.linq.sendMessage(chatId, `Chat history cleared (${result.count} messages).`);
    } catch (err) {
      this.log.error(`clear failed for chat=${chatId}`, err as Error);
      await this.linq
        .sendMessage(chatId, "Sorry — I couldn't clear the chat.")
        .catch(() => undefined);
    }
  }

  private async runAgent(
    chatId: string,
    messageId: string,
    sender: string,
    text: string,
    isGroup: boolean,
  ): Promise<void> {
    await this.linq.addReaction(messageId, '👀');

    let refreshTimer: NodeJS.Timeout | undefined;
    if (!isGroup) {
      void this.linq.startTyping(chatId);
      refreshTimer = setInterval(() => {
        void this.linq.startTyping(chatId);
      }, 8000);
    }

    try {
      const reply = await this.agent.handle(chatId, sender, text);
      await this.linq.sendMessage(chatId, reply);
      await this.linq.removeReaction(messageId, '👀');
      await this.linq.addReaction(messageId, '✅');
    } catch (err) {
      const isTimeout = err instanceof AgentTimeoutError;
      this.log.error(
        `agent ${isTimeout ? 'timed out' : 'failed'} for chat=${chatId}`,
        err as Error,
      );
      await this.linq.removeReaction(messageId, '👀');
      await this.linq.addReaction(messageId, '❌');
      const reply = isTimeout
        ? 'Sorry — that took too long. Try again?'
        : 'Sorry — I hit an error handling that.';
      await this.linq.sendMessage(chatId, reply).catch(() => undefined);
    } finally {
      if (refreshTimer) clearInterval(refreshTimer);
    }
  }
}
