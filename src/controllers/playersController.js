// =============================================================================
// NoverThinker - Players Controller
// =============================================================================

const { query } = require('../config/database');
const { cache } = require('../config/redis');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// @desc    Get players for Radar feed
// @route   GET /api/players
// @access  Public
const getPlayers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    position,
    ageGroup,
    minNovaScore,
    maxNovaScore,
    sortBy = 'nova_score',
    sortOrder = 'DESC',
    search
  } = req.query;

  const offset = (page - 1) * limit;
  const params = [];
  let paramIndex = 1;

  // Build WHERE clause
  let whereClause = 'WHERE pp.profile_visibility = \'public\'';

  if (position) {
    whereClause += ` AND (pp.primary_position = $${paramIndex} OR pp.secondary_position = $${paramIndex})`;
    params.push(position);
    paramIndex++;
  }

  if (ageGroup) {
    whereClause += ` AND pp.age_group = $${paramIndex}`;
    params.push(ageGroup);
    paramIndex++;
  }

  if (minNovaScore) {
    whereClause += ` AND pp.nova_score >= $${paramIndex}`;
    params.push(parseFloat(minNovaScore));
    paramIndex++;
  }

  if (maxNovaScore) {
    whereClause += ` AND pp.nova_score <= $${paramIndex}`;
    params.push(parseFloat(maxNovaScore));
    paramIndex++;
  }

  if (search) {
    whereClause += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Validate sort column
  const validSortColumns = ['nova_score', 'created_at', 'stars', 'discipline_score'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'nova_score';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].total);

  // Get players
  const playersResult = await query(
    `SELECT 
       pp.id,
       pp.user_id,
       u.first_name,
       u.last_name,
       u.avatar_url,
       pp.date_of_birth,
       pp.age_group,
       pp.nationality,
       pp.height_cm,
       pp.primary_position,
       pp.secondary_position,
       pp.nova_score,
       pp.nova_score_trend,
       pp.stars,
       pp.star_type,
       pp.discipline_score,
       pp.total_matches,
       pp.total_goals,
       pp.total_assists,
       t.name as team_name,
       c.name as club_name,
       c.logo_url as club_logo
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     ${whereClause}
     ORDER BY pp.${sortColumn} ${order}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, parseInt(limit), offset]
  );

  res.json({
    success: true,
    data: {
      players: playersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get single player by ID
// @route   GET /api/players/:id
// @access  Public
const getPlayer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try cache first
  const cacheKey = `player:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  // Get player with full details
  const playerResult = await query(
    `SELECT 
       pp.*,
       u.first_name,
       u.last_name,
       u.avatar_url,
       u.email,
       pa.pace,
       pa.shooting,
       pa.passing,
       pa.dribbling,
       pa.defending,
       pa.physical,
       pa.aggression,
       pa.composure,
       pa.concentration,
       t.id as team_id,
       t.name as team_name,
       t.age_group as team_age_group,
       c.id as club_id,
       c.name as club_name,
       c.logo_url as club_logo,
       c.city as club_city
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN player_attributes pa ON pa.player_id = pp.id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     WHERE pp.id = $1`,
    [id]
  );

  if (playerResult.rows.length === 0) {
    throw new AppError('Player not found', 404, 'PLAYER_NOT_FOUND');
  }

  const player = playerResult.rows[0];

  // Get top 3 videos
  const videosResult = await query(
    `SELECT v.id, v.title, v.video_url, v.thumbnail_url, v.duration_seconds, 
            v.category, v.impact_level, v.views_count, v.likes_count
     FROM top_player_videos tpv
     JOIN videos v ON v.id = tpv.video_id
     WHERE tpv.player_id = $1
     ORDER BY tpv.position ASC
     LIMIT 3`,
    [id]
  );

  // Get recent NovaScore history (last 30 days)
  const historyResult = await query(
    `SELECT recorded_date, nova_score, match_score, task_score, video_score, physical_score
     FROM nova_score_history
     WHERE player_id = $1
     ORDER BY recorded_date DESC
     LIMIT 30`,
    [id]
  );

  const responseData = {
    player: {
      ...player,
      attributes: {
        pace: player.pace,
        shooting: player.shooting,
        passing: player.passing,
        dribbling: player.dribbling,
        defending: player.defending,
        physical: player.physical,
        aggression: player.aggression,
        composure: player.composure,
        concentration: player.concentration
      },
      team: player.team_id ? {
        id: player.team_id,
        name: player.team_name,
        ageGroup: player.team_age_group
      } : null,
      club: player.club_id ? {
        id: player.club_id,
        name: player.club_name,
        logo: player.club_logo,
        city: player.club_city
      } : null
    },
    topVideos: videosResult.rows,
    novaScoreHistory: historyResult.rows
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, responseData, 300);

  res.json({
    success: true,
    data: responseData
  });
});

// @desc    Get player analytics (Agent-only panels)
// @route   GET /api/players/:id/analytics
// @access  Private (Agent)
const getPlayerAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if player exists
  const playerResult = await query(
    'SELECT id, nova_score, discipline_score FROM player_profiles WHERE id = $1',
    [id]
  );

  if (playerResult.rows.length === 0) {
    throw new AppError('Player not found', 404);
  }

  const player = playerResult.rows[0];

  // Try to get cached analytics
  const cacheKey = `analytics:${id}`;
  let analytics = await cache.get(cacheKey);

  if (!analytics) {
    // Get or calculate analytics
    const analyticsResult = await query(
      'SELECT * FROM agent_analytics_cache WHERE player_id = $1',
      [id]
    );

    if (analyticsResult.rows.length > 0) {
      analytics = analyticsResult.rows[0];
    } else {
      // Calculate analytics on-the-fly
      analytics = await calculatePlayerAnalytics(id, player);
    }

    // Cache for 1 hour
    await cache.set(cacheKey, analytics, 3600);
  }

  // Get recent matches for context
  const matchesResult = await query(
    `SELECT m.match_date, m.opponent_name, m.team_score, m.opponent_score, m.result,
            mp.minutes_played, mp.goals, mp.assists, mp.performance_credits
     FROM match_performances mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.player_id = $1
     ORDER BY m.match_date DESC
     LIMIT 10`,
    [id]
  );

  res.json({
    success: true,
    data: {
      playerId: id,
      novaScore: player.nova_score,
      performance: analytics.performance_data,
      consistency: {
        score: analytics.consistency_score,
        level: analytics.consistency_level,
        trend: analytics.consistency_trend
      },
      workRate: {
        score: analytics.work_rate_score,
        level: analytics.work_rate_level,
        breakdown: analytics.work_rate_breakdown
      },
      risk: {
        score: analytics.risk_score,
        level: analytics.risk_level,
        factors: analytics.risk_factors
      },
      recentMatches: matchesResult.rows,
      lastCalculated: analytics.last_calculated_at
    }
  });
});

// Calculate player analytics
const calculatePlayerAnalytics = async (playerId, player) => {
  // This would be a complex calculation based on:
  // - Match performance history
  // - Task completion rates
  // - Attendance records
  // - NovaScore trends

  // Simplified version for now
  const analytics = {
    performance_data: {
      overall: player.nova_score,
      matchScore: player.nova_score * 0.45,
      taskScore: player.nova_score * 0.25,
      videoScore: player.nova_score * 0.15,
      physicalScore: player.nova_score * 0.15
    },
    consistency_score: Math.round(player.nova_score * 0.9),
    consistency_level: player.nova_score >= 80 ? 'high' : player.nova_score >= 60 ? 'medium' : 'low',
    consistency_trend: 'stable',
    work_rate_score: player.discipline_score,
    work_rate_level: player.discipline_score >= 90 ? 'elite' : player.discipline_score >= 75 ? 'high' : 'medium',
    work_rate_breakdown: {
      attendance: Math.round(player.discipline_score * 0.4),
      taskCompletion: Math.round(player.discipline_score * 0.3),
      uploadFrequency: Math.round(player.discipline_score * 0.2),
      discipline: Math.round(player.discipline_score * 0.1)
    },
    risk_score: 100 - Math.round((100 - player.discipline_score) * 0.5),
    risk_level: player.discipline_score >= 80 ? 'low' : player.discipline_score >= 60 ? 'medium' : 'high',
    risk_factors: {
      consistency: player.nova_score >= 70 ? 'low' : 'medium',
      discipline: player.discipline_score >= 80 ? 'low' : 'medium',
      engagement: 'medium'
    },
    last_calculated_at: new Date()
  };

  // Store in cache table
  await query(
    `INSERT INTO agent_analytics_cache 
     (player_id, performance_data, consistency_score, consistency_level, consistency_trend,
      work_rate_score, work_rate_level, work_rate_breakdown, risk_score, risk_level, risk_factors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (player_id) DO UPDATE SET
       performance_data = $2,
       consistency_score = $3,
       consistency_level = $4,
       consistency_trend = $5,
       work_rate_score = $6,
       work_rate_level = $7,
       work_rate_breakdown = $8,
       risk_score = $9,
       risk_level = $10,
       risk_factors = $11,
       last_calculated_at = NOW(),
       updated_at = NOW()`,
    [
      playerId,
      JSON.stringify(analytics.performance_data),
      analytics.consistency_score,
      analytics.consistency_level,
      analytics.consistency_trend,
      analytics.work_rate_score,
      analytics.work_rate_level,
      JSON.stringify(analytics.work_rate_breakdown),
      analytics.risk_score,
      analytics.risk_level,
      JSON.stringify(analytics.risk_factors)
    ]
  );

  return analytics;
};

// @desc    Discover players (Advanced search for agents)
// @route   GET /api/players/discover
// @access  Private (Agent)
const discoverPlayers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    positions,       // comma-separated: "ST,CAM,RW"
    ageGroups,       // comma-separated: "U17,U19"
    minNovaScore,
    maxNovaScore,
    minStars,
    clubs,           // comma-separated club IDs
    nationality,
    preferredFoot,
    minHeight,
    maxHeight,
    sortBy = 'nova_score',
    sortOrder = 'DESC'
  } = req.query;

  const offset = (page - 1) * limit;
  const params = [];
  let paramIndex = 1;

  let whereClause = 'WHERE pp.profile_visibility = \'public\'';

  // Multiple positions filter
  if (positions) {
    const posArray = positions.split(',');
    whereClause += ` AND (pp.primary_position = ANY($${paramIndex}) OR pp.secondary_position = ANY($${paramIndex}))`;
    params.push(posArray);
    paramIndex++;
  }

  // Multiple age groups filter
  if (ageGroups) {
    const ageArray = ageGroups.split(',');
    whereClause += ` AND pp.age_group = ANY($${paramIndex})`;
    params.push(ageArray);
    paramIndex++;
  }

  if (minNovaScore) {
    whereClause += ` AND pp.nova_score >= $${paramIndex}`;
    params.push(parseFloat(minNovaScore));
    paramIndex++;
  }

  if (maxNovaScore) {
    whereClause += ` AND pp.nova_score <= $${paramIndex}`;
    params.push(parseFloat(maxNovaScore));
    paramIndex++;
  }

  if (minStars) {
    whereClause += ` AND pp.stars >= $${paramIndex}`;
    params.push(parseFloat(minStars));
    paramIndex++;
  }

  if (nationality) {
    whereClause += ` AND pp.nationality ILIKE $${paramIndex}`;
    params.push(`%${nationality}%`);
    paramIndex++;
  }

  if (preferredFoot) {
    whereClause += ` AND pp.preferred_foot = $${paramIndex}`;
    params.push(preferredFoot);
    paramIndex++;
  }

  if (minHeight) {
    whereClause += ` AND pp.height_cm >= $${paramIndex}`;
    params.push(parseInt(minHeight));
    paramIndex++;
  }

  if (maxHeight) {
    whereClause += ` AND pp.height_cm <= $${paramIndex}`;
    params.push(parseInt(maxHeight));
    paramIndex++;
  }

  if (clubs) {
    const clubArray = clubs.split(',');
    whereClause += ` AND c.id = ANY($${paramIndex})`;
    params.push(clubArray);
    paramIndex++;
  }

  // Valid sort columns for discover
  const validSortColumns = ['nova_score', 'stars', 'discipline_score', 'nova_score_trend', 'total_goals'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'nova_score';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Get total count
  const countResult = await query(
    `SELECT COUNT(DISTINCT pp.id) as total
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].total);

  // Get players with all relevant data for agents
  const playersResult = await query(
    `SELECT DISTINCT ON (pp.id)
       pp.id,
       u.first_name,
       u.last_name,
       u.avatar_url,
       pp.date_of_birth,
       pp.age_group,
       pp.nationality,
       pp.height_cm,
       pp.weight_kg,
       pp.preferred_foot,
       pp.primary_position,
       pp.secondary_position,
       pp.nova_score,
       pp.nova_score_trend,
       pp.match_score,
       pp.task_score,
       pp.video_score,
       pp.physical_score,
       pp.stars,
       pp.star_type,
       pp.discipline_score,
       pp.total_matches,
       pp.total_goals,
       pp.total_assists,
       t.name as team_name,
       c.name as club_name,
       c.logo_url as club_logo
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     ${whereClause}
     ORDER BY pp.id, pp.${sortColumn} ${order}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, parseInt(limit), offset]
  );

  // Check if any are in agent's watchlist
  if (req.user && req.user.userType === 'agent') {
    const agentProfile = await query(
      'SELECT id FROM agent_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (agentProfile.rows.length > 0) {
      const watchlistResult = await query(
        'SELECT player_id FROM agent_watchlists WHERE agent_id = $1',
        [agentProfile.rows[0].id]
      );
      
      const watchlistIds = watchlistResult.rows.map(r => r.player_id);
      
      playersResult.rows.forEach(player => {
        player.inWatchlist = watchlistIds.includes(player.id);
      });
    }
  }

  res.json({
    success: true,
    data: {
      players: playersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      },
      filters: {
        positions: positions?.split(','),
        ageGroups: ageGroups?.split(','),
        minNovaScore,
        maxNovaScore,
        minStars,
        nationality,
        preferredFoot,
        minHeight,
        maxHeight
      }
    }
  });
});

// @desc    Compare multiple players
// @route   POST /api/players/compare
// @access  Private (Agent)
const comparePlayers = asyncHandler(async (req, res) => {
  const { playerIds } = req.body;

  if (!playerIds || !Array.isArray(playerIds) || playerIds.length < 2 || playerIds.length > 4) {
    throw new AppError('Please provide 2-4 player IDs to compare', 400);
  }

  // Get all players with their details
  const playersResult = await query(
    `SELECT 
       pp.*,
       u.first_name,
       u.last_name,
       u.avatar_url,
       pa.pace,
       pa.shooting,
       pa.passing,
       pa.dribbling,
       pa.defending,
       pa.physical,
       t.name as team_name,
       c.name as club_name,
       c.logo_url as club_logo
     FROM player_profiles pp
     JOIN users u ON u.id = pp.user_id
     LEFT JOIN player_attributes pa ON pa.player_id = pp.id
     LEFT JOIN team_players tp ON tp.player_id = pp.id AND tp.is_active = true
     LEFT JOIN teams t ON t.id = tp.team_id
     LEFT JOIN clubs c ON c.id = t.club_id
     WHERE pp.id = ANY($1)`,
    [playerIds]
  );

  if (playersResult.rows.length < 2) {
    throw new AppError('Could not find enough players to compare', 404);
  }

  // Get analytics for each player
  const analyticsPromises = playersResult.rows.map(async (player) => {
    const analyticsResult = await query(
      'SELECT * FROM agent_analytics_cache WHERE player_id = $1',
      [player.id]
    );
    return {
      playerId: player.id,
      analytics: analyticsResult.rows[0] || null
    };
  });

  const analyticsData = await Promise.all(analyticsPromises);

  // Format comparison data
  const comparison = playersResult.rows.map(player => {
    const playerAnalytics = analyticsData.find(a => a.playerId === player.id)?.analytics;
    
    return {
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      avatarUrl: player.avatar_url,
      position: player.primary_position,
      ageGroup: player.age_group,
      team: player.team_name,
      club: player.club_name,
      clubLogo: player.club_logo,
      novaScore: player.nova_score,
      trend: player.nova_score_trend,
      stars: player.stars,
      starType: player.star_type,
      overall: Math.round((player.pace + player.shooting + player.passing + 
                          player.dribbling + player.defending + player.physical) / 6),
      performanceBreakdown: {
        matchScore: player.match_score,
        taskScore: player.task_score,
        videoScore: player.video_score,
        physicalScore: player.physical_score
      },
      attributes: {
        pace: player.pace,
        shooting: player.shooting,
        passing: player.passing,
        dribbling: player.dribbling,
        defending: player.defending,
        physical: player.physical
      },
      consistency: playerAnalytics ? {
        score: playerAnalytics.consistency_score,
        level: playerAnalytics.consistency_level
      } : null,
      workRate: playerAnalytics ? {
        score: playerAnalytics.work_rate_score,
        level: playerAnalytics.work_rate_level
      } : null,
      risk: playerAnalytics ? {
        score: playerAnalytics.risk_score,
        level: playerAnalytics.risk_level
      } : null
    };
  });

  res.json({
    success: true,
    data: {
      players: comparison,
      comparedAt: new Date()
    }
  });
});

module.exports = {
  getPlayers,
  getPlayer,
  getPlayerAnalytics,
  discoverPlayers,
  comparePlayers
};
