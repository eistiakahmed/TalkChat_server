import { z } from 'zod';
import { ConversationType, MemberRole } from '@prisma/client';

/**
 * Helper to parse array fields that may arrive either as native arrays (JSON)
 * or as serialized JSON strings (multipart/form-data).
 * 
 * @see https://zod.dev/?id=preprocess
 */
const parseArrayOrJson = (val: unknown): unknown => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

/**
 * Direct (1-to-1) Chat Creation Validation Schema.
 * 
 * Validates request body to ensure a valid target participant UUID is provided.
 * Direct chat creation is idempotent and restricted to 1-to-1 interactions.
 * 
 * @see https://zod.dev/?id=strings
 * @see https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)
 */
export const createDirectChatSchema = z.object({
  body: z.object({
    participantId: z
      .string({ required_error: 'Participant ID is required' })
      .uuid('Participant ID must be a valid UUID format'),
  }),
});

/**
 * Group Chat Creation Validation Schema.
 * 
 * Validates metadata required to initiate a group conversation.
 * Handles both JSON payload and multipart/form-data for initial avatar uploads.
 * 
 * @see https://zod.dev/?id=arrays
 * @see https://owasp.org/www-community/attacks/Denial_of_Service
 */
export const createGroupChatSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Group title is required' })
      .min(1, 'Group title cannot be empty')
      .max(100, 'Group title cannot exceed 100 characters')
      .trim(),
    description: z
      .string()
      .max(255, 'Description cannot exceed 255 characters')
      .trim()
      .optional(),
    memberIds: z.preprocess(
      parseArrayOrJson,
      z
        .array(z.string().uuid('Each member ID must be a valid UUID'), {
          required_error: 'Member IDs array is required',
        })
        .min(1, 'At least one participant must be invited to the group')
        .max(99, 'A group cannot exceed 100 total initial members')
    ),
  }),
});

/**
 * Conversation List Query Validation Schema.
 * 
 * All filtering and pagination parameters are passed in the request body
 * to adhere strictly to the body-only parameter convention.
 * 
 * @see https://zod.dev/?id=coercion
 */
export const getChatsListSchema = z.object({
  body: z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
    type: z.nativeEnum(ConversationType).optional(),
  }),
});

/**
 * Conversation Details Validation Schema.
 * 
 * Validates the conversation UUID passed strictly in the request body.
 * 
 * @see https://owasp.org/www-project-api-security/ (BOLA / Broken Object Level Authorization)
 */
export const chatDetailsSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
  }),
});

/**
 * Group Chat Metadata Update Validation Schema.
 * 
 * Allows updating group title, description, or avatar.
 * Enforces body payload validation.
 * 
 * @see https://zod.dev/?id=objects
 */
export const updateGroupChatSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    title: z
      .string()
      .min(1, 'Group title cannot be empty')
      .max(100, 'Group title cannot exceed 100 characters')
      .trim()
      .optional(),
    description: z
      .string()
      .max(255, 'Description cannot exceed 255 characters')
      .trim()
      .optional(),
  }),
});

/**
 * Group Member Addition Validation Schema.
 * 
 * Validates list of member UUIDs to add into an existing group chat.
 * 
 * @see https://zod.dev/?id=arrays
 */
export const addMembersSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    memberIds: z.preprocess(
      parseArrayOrJson,
      z
        .array(z.string().uuid('Each member ID must be a valid UUID'), {
          required_error: 'Member IDs array is required',
        })
        .min(1, 'At least one member ID must be provided')
    ),
  }),
});

/**
 * Member Removal Validation Schema.
 * 
 * Validates target user to be removed from the conversation.
 * 
 * @see https://owasp.org/www-project-api-security/
 */
export const removeMemberSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    targetUserId: z
      .string({ required_error: 'Target user ID is required' })
      .uuid('Target user ID must be a valid UUID format'),
  }),
});

/**
 * Member Role Update Validation Schema.
 * 
 * Validates target user and new role assignment.
 * Supported roles: ADMIN, MODERATOR, MEMBER.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-schema/data-model#defining-enums
 */
export const updateMemberRoleSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    targetUserId: z
      .string({ required_error: 'Target user ID is required' })
      .uuid('Target user ID must be a valid UUID format'),
    role: z.nativeEnum(MemberRole, {
      required_error: 'Role must be one of ADMIN, MODERATOR, or MEMBER',
    }),
  }),
});

/**
 * Leave Group Validation Schema.
 * 
 * Validates conversation UUID for voluntary exit.
 */
export const leaveGroupSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
  }),
});

/**
 * Mute Conversation Validation Schema.
 * 
 * Validates mute toggle flag and optional mute expiry ISO datetime.
 * 
 * @see https://zod.dev/?id=iso-datetimes
 */
export const muteChatSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
    isMuted: z.boolean({ required_error: 'isMuted boolean flag is required' }),
    mutedUntil: z
      .string()
      .datetime({ message: 'mutedUntil must be a valid ISO 8601 date string' })
      .nullable()
      .optional(),
  }),
});

/**
 * Mark Conversation as Read Validation Schema.
 * 
 * Resets member's unread counter to 0.
 */
export const markReadSchema = z.object({
  body: z.object({
    conversationId: z
      .string({ required_error: 'Conversation ID is required' })
      .uuid('Conversation ID must be a valid UUID format'),
  }),
});

// TypeScript type definitions derived directly from schemas
export type CreateDirectChatInput = z.infer<typeof createDirectChatSchema>['body'];
export type CreateGroupChatInput = z.infer<typeof createGroupChatSchema>['body'];
export type GetChatsListInput = z.infer<typeof getChatsListSchema>['body'];
export type ChatDetailsInput = z.infer<typeof chatDetailsSchema>['body'];
export type UpdateGroupChatInput = z.infer<typeof updateGroupChatSchema>['body'];
export type AddMembersInput = z.infer<typeof addMembersSchema>['body'];
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>['body'];
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>['body'];
export type LeaveGroupInput = z.infer<typeof leaveGroupSchema>['body'];
export type MuteChatInput = z.infer<typeof muteChatSchema>['body'];
export type MarkReadInput = z.infer<typeof markReadSchema>['body'];
