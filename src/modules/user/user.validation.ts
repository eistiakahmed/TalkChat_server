import { z } from 'zod';
import { ContactStatus } from '@prisma/client';

/**
 * User & Contact Management Zod Validation Schemas.
 * 
 * Validates request payloads, path parameters, and query parameters for:
 * - Profile updating (name, bio)
 * - User search pagination
 * - Contact requests (friend additions)
 * - User blocking and unblocking operations
 * 
 * @see https://zod.dev
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
 */

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters')
      .optional(),
    bio: z
      .string()
      .trim()
      .max(255, 'Bio cannot exceed 255 characters')
      .optional(),
    avatarUrl: z
      .string()
      .trim()
      .optional(),
    avatarBase64: z
      .string()
      .optional(),
  }),
});

export const searchUserSchema = z.object({
  query: z.object({
    q: z
      .string()
      .trim()
      .min(1, 'Search query is required')
      .max(50, 'Search query too long'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  }),
});

export const contactParamSchema = z.object({
  params: z.object({
    contactId: z.string().uuid('Invalid contact UUID format'),
  }),
});

export const respondContactSchema = z.object({
  params: z.object({
    contactId: z.string().uuid('Invalid contact UUID format'),
  }),
  body: z.object({
    status: z.enum([ContactStatus.ACCEPTED, ContactStatus.BLOCKED]),
  }),
});

export const blockParamSchema = z.object({
  params: z.object({
    targetUserId: z.string().uuid('Invalid user UUID format'),
  }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type SearchUserQuery = z.infer<typeof searchUserSchema>['query'];
