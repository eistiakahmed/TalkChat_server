import { z } from 'zod';

/**
 * Authentication Input Validation Schemas.
 * 
 * Uses Zod to strictly parse and sanitize incoming HTTP request payloads before reaching controllers.
 * Enforces sanitization, length boundaries, and regex patterns to defend against injection and
 * malformed inputs.
 * 
 * @see https://zod.dev
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
 */

export const registerSchema = z.object({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
    email: z
      .string()
      .trim()
      .email('Invalid email address format')
      .max(255, 'Email cannot exceed 255 characters'),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(100, 'Password cannot exceed 100 characters'),
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    login: z
      .string()
      .trim()
      .min(1, 'Login identifier (email or username) is required'),
    password: z
      .string()
      .min(1, 'Password is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z
      .string()
      .min(1, 'Refresh token is required'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];
