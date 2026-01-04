-- =============================================================================
-- NoverThinker Database Schema
-- PostgreSQL 15+ | 25+ Tables | German Youth Football Scouting Platform
-- =============================================================================
-- Client: Menelik | Developer: Oscar | Sprint 0 - January 2026
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- =============================================================================
-- 1. USERS & AUTHENTICATION
-- =============================================================================

-- Main users table (all user types)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('player', 'coach', 'agent', 'admin')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);

-- Player profiles (extends users)
CREATE TABLE player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic Info
    date_of_birth DATE NOT NULL,
    age_group VARCHAR(10) CHECK (age_group IN ('U15', 'U16', 'U17', 'U18', 'U19')),
    nationality VARCHAR(100),
    height_cm INTEGER,
    weight_kg DECIMAL(5,2),
    preferred_foot VARCHAR(10) CHECK (preferred_foot IN ('left', 'right', 'both')),
    
    -- Football Info
    primary_position VARCHAR(50) NOT NULL,
    secondary_position VARCHAR(50),
    jersey_number INTEGER,
    
    -- NovaScore System
    nova_score DECIMAL(4,1) DEFAULT 50.0 CHECK (nova_score >= 0 AND nova_score <= 100),
    nova_score_trend DECIMAL(4,1) DEFAULT 0.0,
    match_score DECIMAL(4,1) DEFAULT 0.0,
    task_score DECIMAL(4,1) DEFAULT 0.0,
    video_score DECIMAL(4,1) DEFAULT 0.0,
    physical_score DECIMAL(4,1) DEFAULT 0.0,
    
    -- Stars & Discipline
    stars DECIMAL(2,1) DEFAULT 3.0 CHECK (stars >= 1.0 AND stars <= 5.0),
    star_type VARCHAR(10) DEFAULT 'black' CHECK (star_type IN ('black', 'gold')),
    discipline_score INTEGER DEFAULT 80 CHECK (discipline_score >= 0 AND discipline_score <= 100),
    
    -- Stats
    total_matches INTEGER DEFAULT 0,
    total_goals INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_videos INTEGER DEFAULT 0,
    total_tasks_completed INTEGER DEFAULT 0,
    
    -- Visibility
    profile_visibility VARCHAR(20) DEFAULT 'public' CHECK (profile_visibility IN ('public', 'team_only', 'private')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_player_nova_score ON player_profiles(nova_score DESC);
CREATE INDEX idx_player_age_group ON player_profiles(age_group);
CREATE INDEX idx_player_position ON player_profiles(primary_position);

-- Coach profiles
CREATE TABLE coach_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    license_type VARCHAR(50),
    license_number VARCHAR(100),
    years_experience INTEGER DEFAULT 0,
    specialization VARCHAR(100),
    bio TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent profiles
CREATE TABLE agent_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    agency_name VARCHAR(255),
    license_number VARCHAR(100),
    years_experience INTEGER DEFAULT 0,
    specialization VARCHAR(100),
    bio TEXT,
    website VARCHAR(255),
    
    -- Subscription
    subscription_tier VARCHAR(20) DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro', 'elite')),
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. TEAMS & CLUBS
-- =============================================================================

-- Clubs/Organizations
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    logo_url TEXT,
    country VARCHAR(100) DEFAULT 'Germany',
    city VARCHAR(100),
    league VARCHAR(100),
    founded_year INTEGER,
    website VARCHAR(255),
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Teams (e.g., Bayern U17, Bayern U19)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    age_group VARCHAR(10) CHECK (age_group IN ('U15', 'U16', 'U17', 'U18', 'U19')),
    season VARCHAR(20),
    
    head_coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assistant_coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    logo_url TEXT,
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teams_club ON teams(club_id);
CREATE INDEX idx_teams_age_group ON teams(age_group);

-- Team Players (many-to-many: players can be in multiple teams over time)
CREATE TABLE team_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    jersey_number INTEGER,
    position VARCHAR(50),
    role VARCHAR(50) DEFAULT 'player' CHECK (role IN ('player', 'captain', 'vice_captain')),
    
    joined_date DATE DEFAULT CURRENT_DATE,
    left_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(team_id, player_id, is_active)
);

CREATE INDEX idx_team_players_team ON team_players(team_id);
CREATE INDEX idx_team_players_player ON team_players(player_id);

-- =============================================================================
-- 3. SOCIAL & RELATIONSHIPS
-- =============================================================================

-- Player follows (players following other players)
CREATE TABLE player_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON player_follows(follower_id);
CREATE INDEX idx_follows_following ON player_follows(following_id);

-- Agent watchlists
CREATE TABLE agent_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    notes TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    tags JSONB DEFAULT '[]',
    
    nova_score_at_add DECIMAL(4,1),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(agent_id, player_id)
);

CREATE INDEX idx_watchlist_agent ON agent_watchlists(agent_id);
CREATE INDEX idx_watchlist_player ON agent_watchlists(player_id);

-- =============================================================================
-- 4. MATCHES & PERFORMANCE
-- =============================================================================

-- Matches
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    
    -- Match Info
    opponent_name VARCHAR(255) NOT NULL,
    opponent_logo_url TEXT,
    match_type VARCHAR(50) DEFAULT 'league' CHECK (match_type IN ('league', 'cup', 'friendly', 'tournament')),
    competition_name VARCHAR(255),
    
    -- Date & Location
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    venue VARCHAR(255),
    is_home BOOLEAN DEFAULT TRUE,
    
    -- Result
    team_score INTEGER,
    opponent_score INTEGER,
    result VARCHAR(10) CHECK (result IN ('win', 'draw', 'loss', NULL)),
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    
    -- Metadata
    notes TEXT,
    created_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_matches_team ON matches(team_id);
CREATE INDEX idx_matches_date ON matches(match_date DESC);
CREATE INDEX idx_matches_status ON matches(status);

-- Match Performance (player stats per match)
CREATE TABLE match_performances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Playing Time
    minutes_played INTEGER DEFAULT 0 CHECK (minutes_played >= 0 AND minutes_played <= 120),
    started BOOLEAN DEFAULT FALSE,
    substituted_in INTEGER, -- minute
    substituted_out INTEGER, -- minute
    
    -- Stats
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    
    -- Coach Rating (CRITICAL for NovaScore)
    performance_credits INTEGER CHECK (performance_credits >= 5 AND performance_credits <= 20),
    coach_notes TEXT,
    
    -- Status
    is_locked BOOLEAN DEFAULT FALSE, -- locked after 72 hours
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(match_id, player_id)
);

CREATE INDEX idx_match_perf_match ON match_performances(match_id);
CREATE INDEX idx_match_perf_player ON match_performances(player_id);

-- =============================================================================
-- 5. TASKS & TRAINING
-- =============================================================================

-- Task Library (Admin-curated drills)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('technical', 'tactical', 'physical', 'mental')),
    difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'elite')),
    
    -- Requirements
    requirements JSONB DEFAULT '{}',
    -- Example: {"repetitions": 10, "duration_seconds": 60, "camera_angle": "front"}
    
    -- Media
    example_video_url TEXT,
    thumbnail_url TEXT,
    
    -- Metadata
    estimated_duration_minutes INTEGER,
    equipment_needed JSONB DEFAULT '[]',
    position_specific JSONB DEFAULT '[]', -- ["GK", "CB", "ST"]
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_difficulty ON tasks(difficulty);
CREATE INDEX idx_tasks_active ON tasks(is_active);

-- Task Assignments
CREATE TABLE task_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Assignment Target
    assignment_type VARCHAR(20) NOT NULL CHECK (assignment_type IN ('individual', 'group', 'team', 'global')),
    player_id UUID REFERENCES player_profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    
    -- Assignment Details
    assigned_by UUID NOT NULL REFERENCES users(id),
    due_date TIMESTAMP WITH TIME ZONE,
    instructions TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_assignments_player ON task_assignments(player_id);
CREATE INDEX idx_assignments_team ON task_assignments(team_id);
CREATE INDEX idx_assignments_status ON task_assignments(status);

-- Task Submissions
CREATE TABLE task_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Submission
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    notes TEXT,
    
    -- Review
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_improvement')),
    points_awarded INTEGER CHECK (points_awarded >= 5 AND points_awarded <= 20),
    reviewer_id UUID REFERENCES users(id),
    review_notes TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_assignment ON task_submissions(assignment_id);
CREATE INDEX idx_submissions_player ON task_submissions(player_id);
CREATE INDEX idx_submissions_status ON task_submissions(status);

-- =============================================================================
-- 6. VIDEOS & CONTENT
-- =============================================================================

-- Player Videos (self-uploaded content)
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Video Info
    title VARCHAR(255),
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('training', 'match', 'freestyle', 'coach_task')),
    
    -- Media
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    
    -- Moderation
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    impact_level VARCHAR(10) CHECK (impact_level IN ('low', 'medium', 'high')),
    impact_points INTEGER CHECK (impact_points IN (5, 10, 15)),
    moderator_id UUID REFERENCES users(id),
    moderation_notes TEXT,
    moderated_at TIMESTAMP WITH TIME ZONE,
    
    -- Engagement
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    
    -- Visibility
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'team_only', 'private')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_videos_player ON videos(player_id);
CREATE INDEX idx_videos_category ON videos(category);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created ON videos(created_at DESC);

-- Top Player Videos (featured highlights)
CREATE TABLE top_player_videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    
    position INTEGER DEFAULT 1 CHECK (position >= 1 AND position <= 3),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(player_id, position)
);

-- Video Likes
CREATE TABLE video_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(video_id, user_id)
);

-- Video Comments
CREATE TABLE video_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_video ON video_comments(video_id);

-- =============================================================================
-- 7. PHYSICAL TESTS (COMBINES)
-- =============================================================================

-- Combines (Physical test sessions)
CREATE TABLE combines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    combine_date DATE NOT NULL,
    location VARCHAR(255),
    
    conducted_by UUID REFERENCES users(id),
    
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Combine Results
CREATE TABLE combine_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    combine_id UUID NOT NULL REFERENCES combines(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Sprint Tests (in seconds, lower is better)
    sprint_5m DECIMAL(5,3),
    sprint_10m DECIMAL(5,3),
    sprint_30m DECIMAL(5,3),
    
    -- Agility (in seconds, lower is better)
    agility_slalom DECIMAL(5,2),
    agility_t_test DECIMAL(5,2),
    
    -- Strength (in meters, higher is better)
    medicine_ball_throw DECIMAL(4,2),
    
    -- Endurance
    yoyo_test_level DECIMAL(4,1),
    yoyo_test_distance INTEGER, -- meters
    
    -- Calculated Percentiles (age-normalized, 29-99 display range)
    sprint_percentile INTEGER,
    agility_percentile INTEGER,
    strength_percentile INTEGER,
    endurance_percentile INTEGER,
    overall_physical_percentile INTEGER,
    
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(combine_id, player_id)
);

CREATE INDEX idx_combine_results_player ON combine_results(player_id);

-- =============================================================================
-- 8. PLAYER ATTRIBUTES (FIFA-style)
-- =============================================================================

CREATE TABLE player_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID UNIQUE NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Technical (percentiles 29-99)
    pace INTEGER DEFAULT 50 CHECK (pace >= 29 AND pace <= 99),
    shooting INTEGER DEFAULT 50 CHECK (shooting >= 29 AND shooting <= 99),
    passing INTEGER DEFAULT 50 CHECK (passing >= 29 AND passing <= 99),
    dribbling INTEGER DEFAULT 50 CHECK (dribbling >= 29 AND dribbling <= 99),
    defending INTEGER DEFAULT 50 CHECK (defending >= 29 AND defending <= 99),
    physical INTEGER DEFAULT 50 CHECK (physical >= 29 AND physical <= 99),
    
    -- Mental
    aggression INTEGER DEFAULT 50 CHECK (aggression >= 29 AND aggression <= 99),
    composure INTEGER DEFAULT 50 CHECK (composure >= 29 AND composure <= 99),
    concentration INTEGER DEFAULT 50 CHECK (concentration >= 29 AND concentration <= 99),
    
    -- Last updated by coach
    updated_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 9. TEAM EVENTS & ATTENDANCE
-- =============================================================================

-- Team Events (training, meetings, etc.)
CREATE TABLE team_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('training', 'match', 'meeting', 'fitness', 'recovery', 'other')),
    
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    location VARCHAR(255),
    
    is_mandatory BOOLEAN DEFAULT TRUE,
    
    created_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_team ON team_events(team_id);
CREATE INDEX idx_events_date ON team_events(start_time);

-- Event Attendance
CREATE TABLE event_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    notes TEXT,
    
    marked_by UUID REFERENCES users(id),
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id, player_id)
);

CREATE INDEX idx_attendance_event ON event_attendance(event_id);
CREATE INDEX idx_attendance_player ON event_attendance(player_id);

-- =============================================================================
-- 10. DISCIPLINE & NOTES
-- =============================================================================

-- Discipline Notes (coach notes about player behavior)
CREATE TABLE discipline_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    note_type VARCHAR(20) NOT NULL CHECK (note_type IN ('positive', 'negative', 'neutral')),
    title VARCHAR(255),
    content TEXT NOT NULL,
    
    -- Impact on discipline score
    score_impact INTEGER DEFAULT 0 CHECK (score_impact >= -10 AND score_impact <= 10),
    
    is_private BOOLEAN DEFAULT TRUE, -- only visible to coaches
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_discipline_player ON discipline_notes(player_id);

-- Star Change Requests (for gold star upgrades)
CREATE TABLE star_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    current_stars DECIMAL(2,1),
    requested_stars DECIMAL(2,1),
    current_type VARCHAR(10),
    requested_type VARCHAR(10),
    
    reason TEXT NOT NULL,
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    review_notes TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 11. ANALYTICS & HISTORY
-- =============================================================================

-- NovaScore History (daily snapshots)
CREATE TABLE nova_score_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    nova_score DECIMAL(4,1) NOT NULL,
    match_score DECIMAL(4,1),
    task_score DECIMAL(4,1),
    video_score DECIMAL(4,1),
    physical_score DECIMAL(4,1),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(player_id, recorded_date)
);

CREATE INDEX idx_nova_history_player ON nova_score_history(player_id);
CREATE INDEX idx_nova_history_date ON nova_score_history(recorded_date DESC);

-- Agent Analytics Cache (pre-calculated panels)
CREATE TABLE agent_analytics_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID UNIQUE NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    -- Performance Panel
    performance_data JSONB DEFAULT '{}',
    
    -- Consistency Panel
    consistency_score INTEGER,
    consistency_level VARCHAR(20),
    consistency_trend VARCHAR(20),
    
    -- Work Rate Panel
    work_rate_score INTEGER,
    work_rate_level VARCHAR(20),
    work_rate_breakdown JSONB DEFAULT '{}',
    
    -- Risk Panel (AGENT-ONLY)
    risk_score INTEGER,
    risk_level VARCHAR(20),
    risk_factors JSONB DEFAULT '{}',
    
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 12. PULSE FEED (Real-time Agent Notifications)
-- =============================================================================

CREATE TABLE pulse_feed_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'nova_score_change',
        'star_upgrade',
        'video_approved',
        'match_performance',
        'combine_result',
        'task_completed',
        'milestone_reached'
    )),
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    data JSONB DEFAULT '{}',
    
    -- For NovaScore changes
    old_value DECIMAL(4,1),
    new_value DECIMAL(4,1),
    change_amount DECIMAL(4,1),
    
    importance VARCHAR(20) DEFAULT 'normal' CHECK (importance IN ('low', 'normal', 'high', 'critical')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pulse_player ON pulse_feed_events(player_id);
CREATE INDEX idx_pulse_created ON pulse_feed_events(created_at DESC);
CREATE INDEX idx_pulse_type ON pulse_feed_events(event_type);

-- =============================================================================
-- 13. NOTIFICATIONS
-- =============================================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    body TEXT,
    notification_type VARCHAR(50) NOT NULL,
    
    data JSONB DEFAULT '{}',
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- =============================================================================
-- 14. REFRESH TOKENS (Auth)
-- =============================================================================

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash VARCHAR(255) NOT NULL,
    device_info JSONB DEFAULT '{}',
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- =============================================================================
-- 15. AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    
    old_data JSONB,
    new_data JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_profiles_updated_at BEFORE UPDATE ON player_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_profiles_updated_at BEFORE UPDATE ON coach_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_profiles_updated_at BEFORE UPDATE ON agent_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate age group from date of birth
CREATE OR REPLACE FUNCTION calculate_age_group(dob DATE)
RETURNS VARCHAR(10) AS $$
DECLARE
    age INTEGER;
BEGIN
    age := EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob));
    
    IF age < 15 THEN RETURN 'U15';
    ELSIF age < 16 THEN RETURN 'U15';
    ELSIF age < 17 THEN RETURN 'U17';
    ELSIF age < 18 THEN RETURN 'U17';
    ELSIF age < 19 THEN RETURN 'U19';
    ELSE RETURN 'U19';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Composite indexes for common queries
CREATE INDEX idx_players_discover ON player_profiles(nova_score DESC, age_group, primary_position);
CREATE INDEX idx_videos_feed ON videos(created_at DESC, status, visibility);
CREATE INDEX idx_matches_team_date ON matches(team_id, match_date DESC);

-- =============================================================================
-- SCHEMA COMPLETE
-- 25+ Tables | German Youth Football Scouting Platform
-- =============================================================================
