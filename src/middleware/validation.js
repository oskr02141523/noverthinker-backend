// =============================================================================
// NoverThinker - Validation Middleware
// =============================================================================

const { AppError } = require('./errorHandler');

// Validation helper
const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    // Validate body
    if (schema.body) {
      const bodyErrors = validateObject(req.body, schema.body, 'body');
      errors.push(...bodyErrors);
    }

    // Validate params
    if (schema.params) {
      const paramErrors = validateObject(req.params, schema.params, 'params');
      errors.push(...paramErrors);
    }

    // Validate query
    if (schema.query) {
      const queryErrors = validateObject(req.query, schema.query, 'query');
      errors.push(...queryErrors);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }

    next();
  };
};

// Validate object against schema
const validateObject = (obj, schema, location) => {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = obj[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        location,
        message: rules.message || `${field} is required`
      });
      continue;
    }

    // Skip further validation if not required and empty
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Type check
    if (rules.type) {
      const typeValid = checkType(value, rules.type);
      if (!typeValid) {
        errors.push({
          field,
          location,
          message: `${field} must be a ${rules.type}`
        });
        continue;
      }
    }

    // Min length
    if (rules.minLength && value.length < rules.minLength) {
      errors.push({
        field,
        location,
        message: `${field} must be at least ${rules.minLength} characters`
      });
    }

    // Max length
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push({
        field,
        location,
        message: `${field} must not exceed ${rules.maxLength} characters`
      });
    }

    // Min value
    if (rules.min !== undefined && Number(value) < rules.min) {
      errors.push({
        field,
        location,
        message: `${field} must be at least ${rules.min}`
      });
    }

    // Max value
    if (rules.max !== undefined && Number(value) > rules.max) {
      errors.push({
        field,
        location,
        message: `${field} must not exceed ${rules.max}`
      });
    }

    // Pattern (regex)
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push({
        field,
        location,
        message: rules.patternMessage || `${field} has invalid format`
      });
    }

    // Email validation
    if (rules.email && !isValidEmail(value)) {
      errors.push({
        field,
        location,
        message: `${field} must be a valid email`
      });
    }

    // UUID validation
    if (rules.uuid && !isValidUUID(value)) {
      errors.push({
        field,
        location,
        message: `${field} must be a valid UUID`
      });
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({
        field,
        location,
        message: `${field} must be one of: ${rules.enum.join(', ')}`
      });
    }

    // Custom validation
    if (rules.custom) {
      const customError = rules.custom(value, obj);
      if (customError) {
        errors.push({
          field,
          location,
          message: customError
        });
      }
    }
  }

  return errors;
};

// Type checking
const checkType = (value, type) => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return !isNaN(Number(value));
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && !Array.isArray(value);
    case 'date':
      return !isNaN(Date.parse(value));
    default:
      return true;
  }
};

// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// UUID validation
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Common validation schemas
const schemas = {
  // Auth schemas
  register: {
    body: {
      email: { required: true, email: true },
      password: { required: true, minLength: 8, maxLength: 128 },
      firstName: { required: true, minLength: 2, maxLength: 100 },
      lastName: { required: true, minLength: 2, maxLength: 100 },
      userType: { required: true, enum: ['player', 'coach', 'agent'] }
    }
  },

  login: {
    body: {
      email: { required: true, email: true },
      password: { required: true }
    }
  },

  // Player schemas
  playerProfile: {
    body: {
      dateOfBirth: { required: true, type: 'date' },
      nationality: { maxLength: 100 },
      heightCm: { type: 'number', min: 100, max: 250 },
      weightKg: { type: 'number', min: 30, max: 150 },
      preferredFoot: { enum: ['left', 'right', 'both'] },
      primaryPosition: { required: true, maxLength: 50 },
      secondaryPosition: { maxLength: 50 }
    }
  },

  // UUID param
  uuidParam: {
    params: {
      id: { required: true, uuid: true }
    }
  },

  // Pagination query
  pagination: {
    query: {
      page: { type: 'number', min: 1 },
      limit: { type: 'number', min: 1, max: 100 }
    }
  }
};

module.exports = {
  validate,
  schemas,
  isValidEmail,
  isValidUUID
};
