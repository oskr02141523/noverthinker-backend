// =============================================================================
// NoverThinker - Database Migration Runner
// =============================================================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  console.log('🚀 NoverThinker Database Migration');
  console.log('==================================\n');

  try {
    // Test connection
    console.log('📡 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`📄 Reading schema from: ${schemaPath}`);
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log(`✅ Schema loaded (${schema.length} characters)\n`);

    // Execute schema
    console.log('🔨 Creating tables...\n');
    await client.query(schema);
    
    console.log('✅ Schema created successfully!\n');

    // Verify tables created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`📊 Tables created (${tablesResult.rows.length}):`);
    console.log('─'.repeat(40));
    tablesResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.table_name}`);
    });

    // Release client
    client.release();
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('already exists')) {
      console.log('\n💡 Tables already exist. If you want to recreate them:');
      console.log('   1. Run: node src/database/drop-tables.js');
      console.log('   2. Then run this migration again');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
