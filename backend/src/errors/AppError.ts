import { HttpStatus, HttpStatusCode } from '../constants/httpStatusCodes.js';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly messageKey?: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: string = 'INTERNAL_SERVER_ERROR',
    messageKey?: string,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.messageKey = messageKey;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request parameters', messageKey = 'errors.bad_request', details?: any) {
    super(message, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', messageKey, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', messageKey = 'errors.unauthorized', details?: any) {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', messageKey, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', messageKey = 'errors.forbidden', details?: any) {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN', messageKey, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', messageKey = 'errors.not_found', details?: any) {
    super(message, HttpStatus.NOT_FOUND, 'NOT_FOUND', messageKey, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', errorCode = 'CONFLICT', details?: any) {
    super(message, HttpStatus.CONFLICT, errorCode, undefined, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: any, message = 'Validation failed') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', 'errors.validation_error', details);
  }
}
