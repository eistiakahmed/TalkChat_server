import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.config.js';

/**
 * JWT Token Generation & Verification Utility.
 * 
 * Implements token signing and verification adhering to RFC 7519 (JSON Web Token standard).
 * Employs a dual-token architecture:
 * 1. Short-lived Access Token (e.g. 15 minutes) for authenticating stateless API requests.
 * 2. Long-lived Refresh Token (e.g. 7 days) persisted in PostgreSQL and tracked in Redis
 *    to facilitate seamless token rotation without forcing user re-authentication.
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc7519
 * @see https://jwt.io/introduction
 * @see https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
 */

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate Access and Refresh tokens for an authenticated user.
 * 
 * @param payload - User identity payload embedded in the token
 * @returns Object containing both accessToken and refreshToken strings
 */
export const generateTokens = (payload: TokenPayload): AuthTokens => {
  const accessSignOptions: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  };

  const refreshSignOptions: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
  };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, accessSignOptions);
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshSignOptions);

  return { accessToken, refreshToken };
};

/**
 * Verify and decode an Access Token.
 * 
 * @param token - JWT access token string
 * @returns Decoded TokenPayload
 * @throws JsonWebTokenError or TokenExpiredError if invalid
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
};

/**
 * Verify and decode a Refresh Token.
 * 
 * @param token - JWT refresh token string
 * @returns Decoded TokenPayload
 * @throws JsonWebTokenError or TokenExpiredError if invalid
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
};
