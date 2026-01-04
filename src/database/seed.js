// =============================================================================
// NoverThinker - Database Seed Script
// =============================================================================
// Creates sample data for testing: clubs, teams, players, coaches, agents
// =============================================================================

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// German Youth Football Clubs
const clubs = [
  { name: 'FC Bayern München', short_name: 'Bayern', city: 'Munich', league: 'Bundesliga U19' },
  { name: 'Borussia Dortmund', short_name: 'BVB', city: 'Dortmund', league: 'Bundesliga U19' },
  { name: 'RB Leipzig', short_name: 'Leipzig', city: 'Leipzig', league: 'Bundesliga U19' },
  { name: 'Bayer 04 Leverkusen', short_name: 'Leverkusen', city: 'Leverkusen', league: 'Bundesliga U19' },
  { name: 'VfB Stuttgart', short_name: 'Stuttgart', city: 'Stuttgart', league: 'Bundesliga U19' },
  { name: 'Eintracht Frankfurt', short_name: 'Frankfurt', city: 'Frankfurt', league: 'Bundesliga U19' },
  { name: 'VfL Wolfsburg', short_name: 'Wolfsburg', city: 'Wolfsburg', league: 'Bundesliga U19' },
  { name: 'Borussia Mönchengladbach', short_name: 'Gladbach', city: 'Mönchengladbach', league: 'Bundesliga U19' }
];

// Sample player names
const firstNames = ['Lukas', 'Felix', 'Max', 'Leon', 'Paul', 'Jonas', 'Tim', 'David', 'Niklas', 'Finn', 
                    'Jan', 'Moritz', 'Tom', 'Erik', 'Ben', 'Noah', 'Elias', 'Luis', 'Luca', 'Julian'];
const lastNames = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
                   'Hoffmann', 'Schulz', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann',
                   'Schwarz', 'Braun', 'Zimmermann', 'Krüger'];

const positions = ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST', 'CF'];
const ageGroups = ['U15', 'U17', 'U19'];
const nationalities = ['German', 'German', 'German', 'German', 'Turkish', 'Polish', 'Austrian', 'Swiss'];

// Helper functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDecimal = (min, max) => (Math.random() * (max - min) + min).toFixed(1);

// Generate birth date for age group
const generateBirthDate = (ageGroup) => {
  const currentYear = new Date().getFullYear();
  let birthYear;
  
  switch (ageGroup) {
    case 'U15': birthYear = currentYear - randomBetween(13, 14); break;
    case 'U17': birthYear = currentYear - randomBetween(15, 16); break;
    case 'U19': birthYear = currentYear - randomBetween(17, 18); break;
    default: birthYear = currentYear - 16;
  }
  
  const month = randomBetween(1, 12);
  const day = randomBetween(1, 28);
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

async function seed() {
  console.log('🌱 NoverThinker Database Seed');
  console.log('=============================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create Clubs
    console.log('📍 Creating clubs...');
    const clubIds = [];
    for (const club of clubs) {
      const result = await client.query(
        `INSERT INTO clubs (name, short_name, city, league, country)
         VALUES ($1, $2, $3, $4, 'Germany')
         RETURNING id`,
        [club.name, club.short_name, club.city, club.league]
      );
      clubIds.push({ id: result.rows[0].id, name: club.short_name });
    }
    console.log(`   ✅ Created ${clubIds.length} clubs`);

    // 2. Create Teams (U17 and U19 for each club)
    console.log('👥 Creating teams...');
    const teamIds = [];
    for (const club of clubIds) {
      for (const age of ['U17', 'U19']) {
        const result = await client.query(
          `INSERT INTO teams (club_id, name, age_group, season)
           VALUES ($1, $2, $3, '2025-2026')
           RETURNING id`,
          [club.id, `${club.name} ${age}`, age]
        );
        teamIds.push({ id: result.rows[0].id, clubId: club.id, ageGroup: age });
      }
    }
    console.log(`   ✅ Created ${teamIds.length} teams`);

    // 3. Create sample Coach
    console.log('🧑‍🏫 Creating coaches...');
    const passwordHash = await bcrypt.hash('Coach123!', 12);
    
    const coachResult = await client.query(
      `INSERT INTO users (email, password_hash, user_type, first_name, last_name)
       VALUES ('coach@noverthinker.com', $1, 'coach', 'Thomas', 'Müller')
       RETURNING id`,
      [passwordHash]
    );
    
    await client.query(
      `INSERT INTO coach_profiles (user_id, license_type, years_experience, specialization)
       VALUES ($1, 'UEFA B', 10, 'Youth Development')`,
      [coachResult.rows[0].id]
    );
    console.log('   ✅ Created 1 coach (coach@noverthinker.com / Coach123!)');

    // 4. Create sample Agent
    console.log('🕴️ Creating agents...');
    const agentResult = await client.query(
      `INSERT INTO users (email, password_hash, user_type, first_name, last_name)
       VALUES ('agent@noverthinker.com', $1, 'agent', 'Michael', 'Wagner')
       RETURNING id`,
      [passwordHash]
    );
    
    await client.query(
      `INSERT INTO agent_profiles (user_id, agency_name, years_experience, subscription_tier)
       VALUES ($1, 'Elite Sports Management', 15, 'pro')`,
      [agentResult.rows[0].id]
    );
    console.log('   ✅ Created 1 agent (agent@noverthinker.com / Coach123!)');

    // 5. Create Players (10 per team = 160 players)
    console.log('⚽ Creating players...');
    let playerCount = 0;
    const playerIds = [];

    for (const team of teamIds) {
      for (let i = 0; i < 10; i++) {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${playerCount}@player.noverthinker.com`;
        const position = randomElement(positions);
        const nationality = randomElement(nationalities);
        const birthDate = generateBirthDate(team.ageGroup);
        
        // NovaScore components
        const novaScore = parseFloat(randomDecimal(45, 95));
        const matchScore = parseFloat(randomDecimal(40, 95));
        const taskScore = parseFloat(randomDecimal(40, 95));
        const videoScore = parseFloat(randomDecimal(30, 90));
        const physicalScore = parseFloat(randomDecimal(40, 95));
        const trend = parseFloat(randomDecimal(-5, 8));
        const stars = parseFloat((randomBetween(25, 45) / 10).toFixed(1));
        const starType = stars >= 4.0 ? 'gold' : 'black';
        const disciplineScore = randomBetween(60, 98);

        // Create user
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, user_type, first_name, last_name)
           VALUES ($1, $2, 'player', $3, $4)
           RETURNING id`,
          [email, passwordHash, firstName, lastName]
        );

        // Create player profile
        const profileResult = await client.query(
          `INSERT INTO player_profiles 
           (user_id, date_of_birth, age_group, nationality, height_cm, weight_kg,
            preferred_foot, primary_position, nova_score, nova_score_trend,
            match_score, task_score, video_score, physical_score,
            stars, star_type, discipline_score, total_matches, total_goals, total_assists)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           RETURNING id`,
          [
            userResult.rows[0].id, birthDate, team.ageGroup, nationality,
            randomBetween(160, 195), randomBetween(50, 85),
            randomElement(['right', 'right', 'right', 'left', 'both']),
            position, novaScore, trend, matchScore, taskScore, videoScore, physicalScore,
            stars, starType, disciplineScore,
            randomBetween(5, 50), randomBetween(0, 30), randomBetween(0, 25)
          ]
        );

        const playerId = profileResult.rows[0].id;
        playerIds.push(playerId);

        // Create player attributes
        await client.query(
          `INSERT INTO player_attributes 
           (player_id, pace, shooting, passing, dribbling, defending, physical,
            aggression, composure, concentration)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            playerId,
            randomBetween(45, 95), randomBetween(40, 90), randomBetween(45, 92),
            randomBetween(45, 93), randomBetween(35, 90), randomBetween(45, 90),
            randomBetween(40, 85), randomBetween(50, 90), randomBetween(50, 88)
          ]
        );

        // Add to team
        await client.query(
          `INSERT INTO team_players (team_id, player_id, jersey_number, position, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [team.id, playerId, i + 1, position]
        );

        playerCount++;
      }
    }
    console.log(`   ✅ Created ${playerCount} players with profiles and attributes`);

    // 6. Create some watchlist entries for the agent
    console.log('📋 Creating watchlist entries...');
    const agentProfile = await client.query(
      'SELECT id FROM agent_profiles WHERE user_id = $1',
      [agentResult.rows[0].id]
    );
    
    const topPlayers = playerIds.slice(0, 15); // Top 15 players
    for (const playerId of topPlayers) {
      await client.query(
        `INSERT INTO agent_watchlists (agent_id, player_id, priority, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          agentProfile.rows[0].id,
          playerId,
          randomElement(['low', 'medium', 'high', 'critical']),
          'Potential talent to watch'
        ]
      );
    }
    console.log(`   ✅ Created ${topPlayers.length} watchlist entries`);

    // 7. Create NovaScore history (last 30 days for some players)
    console.log('📈 Creating NovaScore history...');
    const historyPlayers = playerIds.slice(0, 30);
    let historyCount = 0;
    
    for (const playerId of historyPlayers) {
      for (let day = 30; day >= 0; day -= 3) {
        const date = new Date();
        date.setDate(date.getDate() - day);
        const dateStr = date.toISOString().split('T')[0];
        
        await client.query(
          `INSERT INTO nova_score_history 
           (player_id, recorded_date, nova_score, match_score, task_score, video_score, physical_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (player_id, recorded_date) DO NOTHING`,
          [
            playerId, dateStr,
            parseFloat(randomDecimal(50, 90)),
            parseFloat(randomDecimal(45, 90)),
            parseFloat(randomDecimal(45, 90)),
            parseFloat(randomDecimal(40, 85)),
            parseFloat(randomDecimal(50, 90))
          ]
        );
        historyCount++;
      }
    }
    console.log(`   ✅ Created ${historyCount} NovaScore history entries`);

    await client.query('COMMIT');

    console.log('\n=============================');
    console.log('🎉 Seed completed successfully!');
    console.log('=============================\n');
    console.log('📊 Summary:');
    console.log(`   • ${clubs.length} clubs`);
    console.log(`   • ${teamIds.length} teams`);
    console.log(`   • ${playerCount} players`);
    console.log(`   • 1 coach account`);
    console.log(`   • 1 agent account`);
    console.log('\n🔑 Test Accounts:');
    console.log('   Coach: coach@noverthinker.com / Coach123!');
    console.log('   Agent: agent@noverthinker.com / Coach123!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run seed
seed().catch(console.error);
