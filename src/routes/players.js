// =============================================================================
// NoverThinker - Players Routes
// =============================================================================

const express = require('express');
const router = express.Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const {
  getPlayers,
  getPlayer,
  getPlayerAnalytics,
  discoverPlayers,
  comparePlayers
} = require('../controllers/playersController');

// Public routes (with optional auth for personalization)
router.get('/', optionalAuth, getPlayers);
router.get('/discover', authenticate, authorize('agent', 'admin'), discoverPlayers);
router.get('/:id', validate(schemas.uuidParam), optionalAuth, getPlayer);

// Agent-only routes
router.get('/:id/analytics', validate(schemas.uuidParam), authenticate, authorize('agent', 'admin'), getPlayerAnalytics);
router.post('/compare', authenticate, authorize('agent', 'admin'), comparePlayers);

module.exports = router;
