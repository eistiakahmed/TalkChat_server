import { z } from 'zod';

/**
 * End-to-End Encryption (E2EE) Request Validation Schemas.
 * 
 * Enforces cryptographic structure for Signal Protocol / X3DH public key exchanges.
 * All parameters are strictly passed in request body (`req.body`).
 * 
 * @see https://signal.org/docs/specifications/x3dh/
 */

const oneTimePreKeyItemSchema = z.object({
  keyId: z.number().int().nonnegative('One-time prekey keyId must be a non-negative integer'),
  publicKey: z.string().min(20, 'One-time prekey publicKey must be a valid public key string'),
});

export const uploadKeyBundleSchema = z.object({
  body: z.object({
    registrationId: z.number().int().positive('Registration ID must be a positive integer'),
    identityKey: z.string().min(20, 'Identity key must be a valid public key string'),
    signedPreKeyId: z.number().int().nonnegative('Signed prekey ID must be a non-negative integer'),
    signedPreKey: z.string().min(20, 'Signed prekey must be a valid public key string'),
    signedPreKeySignature: z.string().min(20, 'Signed prekey signature must be valid'),
    oneTimePreKeys: z.array(oneTimePreKeyItemSchema).min(1, 'At least one one-time prekey is required').max(500, 'Maximum 500 one-time prekeys allowed per upload'),
    deviceId: z.number().int().positive().optional().default(1),
  }),
});

export const refillPreKeysSchema = z.object({
  body: z.object({
    oneTimePreKeys: z.array(oneTimePreKeyItemSchema).min(1, 'At least one one-time prekey is required').max(500, 'Maximum 500 one-time prekeys allowed per upload'),
    deviceId: z.number().int().positive().optional().default(1),
  }),
});

export const getPreKeyBundleSchema = z.object({
  body: z.object({
    recipientId: z.string().uuid('Recipient ID must be a valid UUID'),
    deviceId: z.number().int().positive().optional().default(1),
  }),
});

export const getPreKeyCountSchema = z.object({
  body: z.object({
    deviceId: z.number().int().positive().optional().default(1),
  }),
});

export const getSafetyNumberSchema = z.object({
  body: z.object({
    targetUserId: z.string().uuid('Target user ID must be a valid UUID'),
  }),
});

export type UploadKeyBundleInput = z.infer<typeof uploadKeyBundleSchema>['body'];
export type RefillPreKeysInput = z.infer<typeof refillPreKeysSchema>['body'];
export type GetPreKeyBundleInput = z.infer<typeof getPreKeyBundleSchema>['body'];
export type GetPreKeyCountInput = z.infer<typeof getPreKeyCountSchema>['body'];
export type GetSafetyNumberInput = z.infer<typeof getSafetyNumberSchema>['body'];
