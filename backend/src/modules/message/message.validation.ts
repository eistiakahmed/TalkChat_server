import { z } from 'zod';
import { MessageType, DeliveryStatus } from '@prisma/client';

/**
 * Send Message Validation Schema.
 * 
 * Validates message content, type, conversation target, and optional reply parent.
 * Strictly parses all arguments from the HTTP request body.
 * 
 * @see https://zod.dev/?id=strings
 * @see https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)
 */
export const sendMessageSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    content: z
      .string()
      .max(5000, 'Message content cannot exceed 5000 characters')
      .trim()
      .optional(),
    type: z.nativeEnum(MessageType).default(MessageType.TEXT).optional(),
    parentMessageId: z
      .string()
      .uuid('Parent message ID must be a valid UUID')
      .optional(),
    attachmentBase64: z.string().optional(),
    attachmentName: z.string().optional(),
    attachmentMime: z.string().optional(),
  }),
});

/**
 * Message History List Validation Schema.
 * 
 * Employs high-performance cursor pagination using the composite index
 * on [conversationId, createdAt(sort: Desc)].
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination
 */
export const getMessageHistorySchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    limit: z.coerce.number().int().min(1).max(100).default(30).optional(),
    cursor: z
      .string()
      .uuid('Cursor must be a valid message UUID format')
      .optional(),
  }),
});

/**
 * Edit Message Validation Schema.
 * 
 * Validates message UUID and updated textual content.
 * 
 * @see https://zod.dev/?id=basic-usage
 */
export const editMessageSchema = z.object({
  body: z.object({
    messageId: z
      .string({ required_error: 'Message ID is required' })
      .uuid('Message ID must be a valid UUID format'),
    content: z
      .string({ required_error: 'Updated content is required' })
      .min(1, 'Message content cannot be empty')
      .max(5000, 'Message content cannot exceed 5000 characters')
      .trim(),
  }),
});

/**
 * Delete Message Validation Schema.
 * 
 * Supports both private deletion ("FOR_ME") and global revocation ("FOR_EVERYONE").
 * 
 * @see https://owasp.org/www-project-api-security/
 */
export const deleteMessageSchema = z.object({
  body: z.object({
    messageId: z
      .string({ required_error: 'Message ID is required' })
      .uuid('Message ID must be a valid UUID format'),
    deleteType: z.enum(['FOR_ME', 'FOR_EVERYONE'], {
      required_error: "deleteType must be either 'FOR_ME' or 'FOR_EVERYONE'",
    }),
  }),
});

/**
 * Emoji Reaction Validation Schema.
 * 
 * Validates reaction payload for adding/removing emojis to messages.
 * 
 * @see https://unicode.org/reports/tr51/
 */
export const reactMessageSchema = z.object({
  body: z.object({
    messageId: z
      .string({ required_error: 'Message ID is required' })
      .uuid('Message ID must be a valid UUID format'),
    emoji: z
      .string({ required_error: 'Emoji symbol is required' })
      .min(1, 'Emoji cannot be empty')
      .max(10, 'Emoji cannot exceed 10 characters')
      .trim(),
  }),
});

/**
 * Delivery / Read Receipt Bulk Update Validation Schema.
 * 
 * Updates delivery status (DELIVERED, READ) for multiple messages in a conversation.
 * 
 * @see https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#createmany
 */
export const updateReceiptSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    messageIds: z
      .array(z.string().uuid('Each message ID must be a valid UUID'), {
        required_error: 'messageIds array is required',
      })
      .min(1, 'At least one message ID must be provided'),
    status: z.enum([DeliveryStatus.DELIVERED, DeliveryStatus.READ], {
      required_error: "status must be either 'DELIVERED' or 'READ'",
    }),
  }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];
export type GetMessageHistoryInput = z.infer<typeof getMessageHistorySchema>['body'];
export type EditMessageInput = z.infer<typeof editMessageSchema>['body'];
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>['body'];
export type ReactMessageInput = z.infer<typeof reactMessageSchema>['body'];
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>['body'];
