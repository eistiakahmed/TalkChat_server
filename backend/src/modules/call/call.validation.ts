import { z } from 'zod';

/**
 * WebRTC Call History & Details Validation Schemas.
 * 
 * Enforces strict validation for call logs and details retrieval.
 * All parameters are passed strictly through the request body (`req.body`).
 */

export const getCallHistorySchema = z.object({
  body: z.object({
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: z.string().uuid().optional(),
    type: z.enum(['AUDIO', 'VIDEO']).optional(),
    status: z
      .enum(['INITIATED', 'RINGING', 'ACCEPTED', 'REJECTED', 'MISSED', 'BUSY', 'ENDED'])
      .optional(),
  }),
});

export const getCallDetailsSchema = z.object({
  body: z.object({
    callId: z.string().uuid('Call ID must be a valid UUID'),
  }),
});

export type GetCallHistoryInput = z.infer<typeof getCallHistorySchema>['body'];
export type GetCallDetailsInput = z.infer<typeof getCallDetailsSchema>['body'];
