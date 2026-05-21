import { z } from 'zod';

const messagePart = z.object({
  type: z.string(),
  value: z.string().optional(),
});

const handle = z.object({
  handle: z.string().optional(),
  is_me: z.boolean().optional(),
});

const messageReceivedData = z.object({
  id: z.string(),
  chat: z.object({
    id: z.string(),
    is_group: z.boolean().optional(),
  }),
  sender_handle: handle,
  direction: z.string().optional(),
  parts: z.array(messagePart).optional(),
});

const reactionAddedData = z.object({
  message_id: z.string().optional(),
  reaction_type: z.string().optional(),
  custom_emoji: z.string().nullable().optional(),
  from: z.string().optional(),
  from_handle: handle.optional(),
  is_from_me: z.boolean().optional(),
});

export const messageReceivedEnvelope = z.object({
  event_id: z.string().optional(),
  event_type: z.literal('message.received'),
  data: messageReceivedData,
});

export const reactionAddedEnvelope = z.object({
  event_id: z.string().optional(),
  event_type: z.literal('reaction.added'),
  data: reactionAddedData,
});

export type MessageReceivedEnvelope = z.infer<typeof messageReceivedEnvelope>;
export type ReactionAddedEnvelope = z.infer<typeof reactionAddedEnvelope>;
