/**
 * Custom error classes for Workspace Proxmox Backend
 */

export class WorkspaceError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, WorkspaceError.prototype);
  }
}

/**
 * Authentication Errors (401)
 */
export class AuthenticationError extends WorkspaceError {
  constructor(message: string = 'Authentication failed', code?: string) {
    super(message, 401, code);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor() {
    super('Invalid or expired token', 'INVALID_TOKEN');
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

export class MissingTokenError extends AuthenticationError {
  constructor() {
    super('Missing authorization token', 'MISSING_TOKEN');
    Object.setPrototypeOf(this, MissingTokenError.prototype);
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid username or password', 'INVALID_CREDENTIALS');
    Object.setPrototypeOf(this, InvalidCredentialsError.prototype);
  }
}

/**
 * Authorization Errors (403)
 */
export class AuthorizationError extends WorkspaceError {
  constructor(message: string = 'Access denied', code?: string) {
    super(message, 403, code);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class InsufficientPermissionsError extends AuthorizationError {
  constructor() {
    super('Insufficient permissions to access this resource', 'INSUFFICIENT_PERMISSIONS');
    Object.setPrototypeOf(this, InsufficientPermissionsError.prototype);
  }
}

/**
 * Validation Errors (400)
 */
export class ValidationError extends WorkspaceError {
  constructor(
    public message: string = 'Validation failed',
    public fields?: Record<string, string>,
    code?: string
  ) {
    super(message, 400, code);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class RequiredFieldError extends ValidationError {
  constructor(fieldName: string) {
    super(`Field '${fieldName}' is required`, { [fieldName]: 'required' }, 'REQUIRED_FIELD');
    Object.setPrototypeOf(this, RequiredFieldError.prototype);
  }
}

export class InvalidFormatError extends ValidationError {
  constructor(fieldName: string, format: string) {
    super(
      `Field '${fieldName}' has invalid format (expected ${format})`,
      { [fieldName]: `invalid_format_${format}` },
      'INVALID_FORMAT'
    );
    Object.setPrototypeOf(this, InvalidFormatError.prototype);
  }
}

/**
 * Resource Errors (404)
 */
export class ResourceNotFoundError extends WorkspaceError {
  constructor(resource: string, id?: string, code?: string) {
    super(
      `${resource}${id ? ` with ID '${id}'` : ''} not found`,
      404,
      code || 'RESOURCE_NOT_FOUND'
    );
    Object.setPrototypeOf(this, ResourceNotFoundError.prototype);
  }
}

/**
 * Conflict Errors (409)
 */
export class ConflictError extends WorkspaceError {
  constructor(message: string = 'Conflict', code?: string) {
    super(message, 409, code);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class DuplicateResourceError extends ConflictError {
  constructor(resource: string, field: string) {
    super(
      `${resource} with this ${field} already exists`,
      'DUPLICATE_RESOURCE'
    );
    Object.setPrototypeOf(this, DuplicateResourceError.prototype);
  }
}

/**
 * Database Errors (500)
 */
export class DatabaseError extends WorkspaceError {
  constructor(message: string = 'Database error occurred', code?: string) {
    super(message, 500, code);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ConnectionPoolError extends DatabaseError {
  constructor() {
    super('Database connection pool exhausted', 'CONNECTION_POOL_ERROR');
    Object.setPrototypeOf(this, ConnectionPoolError.prototype);
  }
}

/**
 * Business Logic Errors (400-409)
 */
export class BusinessLogicError extends WorkspaceError {
  constructor(message: string = 'Business logic error', statusCode: number = 400, code?: string) {
    super(message, statusCode, code);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

export class InvalidStateError extends BusinessLogicError {
  constructor(currentState: string, operation: string) {
    super(
      `Cannot perform '${operation}' on resource in state '${currentState}'`,
      409,
      'INVALID_STATE'
    );
    Object.setPrototypeOf(this, InvalidStateError.prototype);
  }
}

/**
 * Rate Limiting Errors (429)
 */
export class RateLimitError extends WorkspaceError {
  constructor(
    public retryAfter: number = 60,
    message: string = 'Too many requests'
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Service Errors (503)
 */
export class ServiceUnavailableError extends WorkspaceError {
  constructor(service: string = 'Service') {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * Timeout Errors (504)
 */
export class TimeoutError extends WorkspaceError {
  constructor(operation: string = 'Operation') {
    super(`${operation} timed out`, 504, 'TIMEOUT');
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error formatter for API responses
 */
export const formatError = (error: any) => {
  if (error instanceof WorkspaceError) {
    return {
      error: error.message,
      statusCode: error.statusCode,
      code: error.code,
      timestamp: new Date().toISOString()
    };
  }

  // Handle unknown errors
  return {
    error: 'Internal server error',
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return async (...args: any[]) => {
    return fn(...args);
  };
};
