// =============================================================================
// NoverThinker - Authentication Controller
// =============================================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
};

// Calculate age group from date of birth
const calculateAgeGroup = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  const age = today.getFullYear() - birthDate.getFullYear();
  
  if (age < 16) return 'U15';
  if (age < 17) return 'U17';
  if (age < 18) return 'U17';
  if (age < 19) return 'U19';
  return 'U19';
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { 
    email, 
    password, 
    firstName, 
    lastName, 
    userType,
    phone,
    // Player specific
    dateOfBirth,
    nationality,
    heightCm,
    weightKg,
    preferredFoot,
    primaryPosition,
    secondaryPosition,
    // Coach specific
    licenseType,
    yearsExperience,
    specialization,
    // Agent specific
    agencyName,
    website
  } = req.body;

  // Check if user exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Create user and profile in transaction
  const result = await transaction(async (client) => {
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, user_type, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, user_type, first_name, last_name, created_at`,
      [email.toLowerCase(), passwordHash, userType, firstName, lastName, phone]
    );

    const user = userResult.rows[0];

    // Create profile based on user type
    let profile = null;

    if (userType === 'player') {
      if (!dateOfBirth || !primaryPosition) {
        throw new AppError('Date of birth and primary position are required for players', 400);
      }

      const ageGroup = calculateAgeGroup(dateOfBirth);

      const profileResult = await client.query(
        `INSERT INTO player_profiles 
         (user_id, date_of_birth, age_group, nationality, height_cm, weight_kg, 
          preferred_foot, primary_position, secondary_position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [user.id, dateOfBirth, ageGroup, nationality, heightCm, weightKg,
         preferredFoot || 'right', primaryPosition, secondaryPosition]
      );
      profile = profileResult.rows[0];

      // Create default player attributes
      await client.query(
        'INSERT INTO player_attributes (player_id) VALUES ($1)',
        [profile.id]
      );
    }

    if (userType === 'coach') {
      const profileResult = await client.query(
        `INSERT INTO coach_profiles (user_id, license_type, years_experience, specialization)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.id, licenseType, yearsExperience || 0, specialization]
      );
      profile = profileResult.rows[0];
    }

    if (userType === 'agent') {
      const profileResult = await client.query(
        `INSERT INTO agent_profiles (user_id, agency_name, years_experience, website)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.id, agencyName, yearsExperience || 0, website]
      );
      profile = profileResult.rows[0];
    }

    return { user, profile };
  });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(result.user.id);

  // Store refresh token
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [result.user.id, refreshTokenHash]
  );

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        userType: result.user.user_type,
        firstName: result.user.first_name,
        lastName: result.user.last_name
      },
      profile: result.profile,
      accessToken,
      refreshToken
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Get user with password
  const userResult = await query(
    `SELECT id, email, password_hash, user_type, first_name, last_name, is_active
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    throw new AppError('Account is deactivated', 401, 'ACCOUNT_DEACTIVATED');
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Get profile based on user type
  let profile = null;
  
  if (user.user_type === 'player') {
    const profileResult = await query(
      'SELECT * FROM player_profiles WHERE user_id = $1',
      [user.id]
    );
    profile = profileResult.rows[0];
  } else if (user.user_type === 'coach') {
    const profileResult = await query(
      'SELECT * FROM coach_profiles WHERE user_id = $1',
      [user.id]
    );
    profile = profileResult.rows[0];
  } else if (user.user_type === 'agent') {
    const profileResult = await query(
      'SELECT * FROM agent_profiles WHERE user_id = $1',
      [user.id]
    );
    profile = profileResult.rows[0];
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Store refresh token
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [user.id, refreshTokenHash]
  );

  // Update last login
  await query(
    'UPDATE users SET last_login = NOW() WHERE id = $1',
    [user.id]
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name
      },
      profile,
      accessToken,
      refreshToken
    }
  });
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new AppError('Refresh token is required', 400);
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type', 401);
  }

  // Check if token exists and not revoked
  const tokenResult = await query(
    `SELECT * FROM refresh_tokens 
     WHERE user_id = $1 AND is_revoked = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 10`,
    [decoded.userId]
  );

  // Verify against stored hashes
  let validToken = null;
  for (const storedToken of tokenResult.rows) {
    const isValid = await bcrypt.compare(token, storedToken.token_hash);
    if (isValid) {
      validToken = storedToken;
      break;
    }
  }

  if (!validToken) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Generate new tokens
  const tokens = generateTokens(decoded.userId);

  // Revoke old token and create new one
  await query('UPDATE refresh_tokens SET is_revoked = true WHERE id = $1', [validToken.id]);
  
  const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [decoded.userId, newRefreshTokenHash]
  );

  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (token) {
    // Revoke all refresh tokens for this user
    await query(
      'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
      [req.user.id]
    );
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const userResult = await query(
    `SELECT id, email, user_type, first_name, last_name, phone, avatar_url, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  const user = userResult.rows[0];

  // Get profile
  let profile = null;
  
  if (user.user_type === 'player') {
    const profileResult = await query(
      `SELECT pp.*, pa.pace, pa.shooting, pa.passing, pa.dribbling, pa.defending, pa.physical
       FROM player_profiles pp
       LEFT JOIN player_attributes pa ON pa.player_id = pp.id
       WHERE pp.user_id = $1`,
      [user.id]
    );
    profile = profileResult.rows[0];
  } else if (user.user_type === 'coach') {
    const profileResult = await query(
      'SELECT * FROM coach_profiles WHERE user_id = $1',
      [user.id]
    );
    profile = profileResult.rows[0];
  } else if (user.user_type === 'agent') {
    const profileResult = await query(
      'SELECT * FROM agent_profiles WHERE user_id = $1',
      [user.id]
    );
    profile = profileResult.rows[0];
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      },
      profile
    }
  });
});

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError('Current and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  // Get current password hash
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );

  const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);

  if (!isMatch) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash new password
  const salt = await bcrypt.genSalt(12);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, req.user.id]
  );

  // Revoke all refresh tokens
  await query(
    'UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1',
    [req.user.id]
  );

  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.'
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  changePassword
};
