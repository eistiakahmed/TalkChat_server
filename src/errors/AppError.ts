import { HttpStatus, HttpStatusCode } from '../constants/httpStatusCodes.js';

/**
 * Base Application Error class for operational errors.
 * 
 * Operational errors represent known runtime issues (e.g., bad inputs, unauthorized access,
 * resource not found) that the application can anticipate and handle gracefully.
 * 
 * @see https://nodejs.org/api/errors.html#errorcapturestacktracetargetobject-constructoropt
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
 */
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

/**
 * 400 Bad Request Error.
 * Thrown when client provides invalid inputs or fails semantic validation.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
 */
export class BadRequestError extends AppError {
  constructor(message = 'Invalid request parameters', messageKey = 'errors.bad_request', details?: any) {
    super(message, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', messageKey, details);
  }
}

/**
 * 401 Unauthorized Error.
 * Thrown when an unauthenticated user attempts to access protected resources.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
 * @see https://datatracker.ietf.org/doc/html/rfc7235#section-3.1
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', messageKey = 'errors.unauthorized', details?: any) {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', messageKey, details);
  }
}

/**
 * 403 Forbidden Error.
 * Thrown when an authenticated user does not have permissions for the requested action.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', messageKey = 'errors.forbidden', details?: any) {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN', messageKey, details);
  }
}

/**
 * 404 Not Found Error.
 * Thrown when the requested resource or route does not exist.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', messageKey = 'errors.not_found', details?: any) {
    super(message, HttpStatus.NOT_FOUND, 'NOT_FOUND', messageKey, details);
  }
}

/**
 * 409 Conflict Error.
 * Thrown when creating a resource that violates a unique constraint (e.g. duplicate email/username).
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', errorCode = 'CONFLICT', details?: any) {
    super(message, HttpStatus.CONFLICT, errorCode, undefined, details);
  }
}

/**
 * 422 Unprocessable Entity (Validation Error).
 * Thrown when request payload fails schema validation (e.g. Zod parsing).
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/422
 * @see https://zod.dev/?id=error-handling
 */
export class ValidationError extends AppError {
  constructor(details: any, message = 'Validation failed') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', 'errors.validation_error', details);
  }
}
