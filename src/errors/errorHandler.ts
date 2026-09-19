import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { HttpStatus } from '../constants/httpStatusCodes.js';
import { t } from '../i18n/i18n.middleware.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.config.js';

/**
 * Global Express Error Handling Middleware.
 * 
 * Intercepts all synchronous and asynchronous errors across controllers and services,
 * formatting them into standardized JSON error payloads. Supports dynamic localization
 * based on the client's `Accept-Language` header via the i18n subsystem.
 * 
 * @see https://expressjs.com/en/guide/error-handling.html
 * @see https://zod.dev/?id=error-handling
 */
export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const lang = req.language || 'en';

  // Handle known operational AppError
  if (err instanceof AppError) {
    const localizedMessage = err.messageKey ? t(err.messageKey, lang) : err.message;

    res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      message: localizedMessage,
      details: err.details || null,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      success: false,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      errorCode: 'VALIDATION_ERROR',
      message: t('errors.validation_error', lang),
      details: formattedErrors,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle unhandled unexpected errors
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
      },
      path: req.path,
      method: req.method,
    },
    '🔥 Unhandled Application Error'
  );

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: t('errors.internal_server_error', lang),
    details: env.NODE_ENV === 'development' ? err.message : null,
    timestamp: new Date().toISOString(),
  });
};
