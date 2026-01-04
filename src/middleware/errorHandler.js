// =============================================================================
// NoverThinker - Error Handling Middleware
// =============================================================================

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Not found handler
const notFound = (req, res, next) => {
  const error = new AppError(`Not found: ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Log error
  if (statusCode >= 500) {
    console.error('❌ Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      body: req.body,
      user: req.user?.id
    });
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
    code = 'DUPLICATE_ERROR';
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Referenced resource not found';
    code = 'REFERENCE_ERROR';
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'Something went wrong';
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code: code,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Async handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  notFound,
  errorHandler,
  asyncHandler
};
