// =============================================================================
// NoverThinker - Authentication Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  changePassword
} = require('../controllers/authController');

// Public routes
router.post('/register', validate(schemas.register), register);
router.post('/login', validate(schemas.login), login);
router.post('/refresh', refreshToken);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/password', authenticate, changePassword);

module.exports = router;
