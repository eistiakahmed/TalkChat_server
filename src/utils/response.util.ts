import { Response } from 'express';
import { HttpStatus, HttpStatusCode } from '../constants/httpStatusCodes.js';

/**
 * Standardized API JSON Response Formatter.
 * 
 * Enforces a uniform, predictable JSON payload contract across all REST endpoints.
 * Includes data payload, status code, success indicator, timestamp, and optional metadata.
 * 
 * @see https://github.com/omniti-labs/jsend
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
 */

export interface ApiResponseOptions<T> {
  res: Response;
  statusCode?: HttpStatusCode;
  message?: string;
  data?: T;
  meta?: Record<string, any>;
}

export const sendResponse = <T>({
  res,
  statusCode = HttpStatus.OK,
  message,
  data,
  meta,
}: ApiResponseOptions<T>): void => {
  res.status(statusCode).json({
    success: true,
    statusCode,
    message: message || 'Success',
    data: data !== undefined ? data : null,
    meta: meta || undefined,
    timestamp: new Date().toISOString(),
  });
};
