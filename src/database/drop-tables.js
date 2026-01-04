// =============================================================================
// NoverThinker - Drop All Tables (Development Only)
// =============================================================================
// ⚠️ WARNING: This will delete ALL data! Use only in development!
// =============================================================================

const { Pool } = require('pg');
require('dotenv').config();

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

async function dropAllTables() {
  console.log('⚠️  NoverThinker - DROP ALL TABLES');
  console.log('==================================\n');
  
  // Safety check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot drop tables in production!');
    process.exit(1);
  }

  try {
    const client = await pool.connect();
    
    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 0) {
      console.log('ℹ️  No tables found to drop.');
      client.release();
      return;
    }

    console.log(`Found ${tablesResult.rows.length} tables to drop:\n`);
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    console.log('');

    // Drop all tables with CASCADE
    console.log('🗑️  Dropping tables...\n');
    
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
    `);

    console.log('✅ All tables dropped successfully!');
    console.log('\n💡 Run migration to recreate tables:');
    console.log('   node src/database/migrate.js');

    client.release();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Confirmation prompt
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  Are you sure you want to DROP ALL TABLES? (yes/no): ', (answer) => {
  rl.close();
  if (answer.toLowerCase() === 'yes') {
    dropAllTables();
  } else {
    console.log('Cancelled.');
    process.exit(0);
  }
});
