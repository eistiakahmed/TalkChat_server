import { z } from 'zod';

/**
 * Ephemeral Stories Input Validation Schemas.
 * 
 * Enforces strict type checking and sanitization on all story payloads.
 * In accordance with project architecture, all payloads are transmitted
 * exclusively via HTTP request bodies (`req.body`).
 * 
 * @see https://zod.dev/?id=basic-usage
 */

export const createStorySchema = z.object({
  body: z.object({
    mediaUrl: z.string().url('Valid media URL is required'),
    mediaPublicId: z.string().max(255).optional(),
    mediaType: z.enum(['IMAGE', 'VIDEO', 'TEXT']).default('IMAGE'),
    caption: z.string().max(500, 'Caption cannot exceed 500 characters').optional(),
    privacy: z.enum(['ALL_CONTACTS', 'CLOSE_FRIENDS', 'SELECTED']).default('ALL_CONTACTS'),
    allowedUserIds: z.array(z.string().uuid('Invalid user UUID')).optional().default([]),
  }),
});

export const getStoryFeedSchema = z.object({
  body: z.object({
    limit: z.coerce.number().int().positive().max(100).optional().default(30),
    cursor: z.string().uuid().optional(),
  }),
});

export const viewStorySchema = z.object({
  body: z.object({
    storyId: z.string().uuid('Story ID must be a valid UUID'),
  }),
});

export const getStoryViewersSchema = z.object({
  body: z.object({
    storyId: z.string().uuid('Story ID must be a valid UUID'),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
    cursor: z.string().uuid().optional(),
  }),
});

export const deleteStorySchema = z.object({
  body: z.object({
    storyId: z.string().uuid('Story ID must be a valid UUID'),
  }),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>['body'];
export type GetStoryFeedInput = z.infer<typeof getStoryFeedSchema>['body'];
export type ViewStoryInput = z.infer<typeof viewStorySchema>['body'];
export type GetStoryViewersInput = z.infer<typeof getStoryViewersSchema>['body'];
export type DeleteStoryInput = z.infer<typeof deleteStorySchema>['body'];
