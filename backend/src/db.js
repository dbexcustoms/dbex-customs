const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Reasonable pool defaults for a small/medium SaaS workload
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

// Always use parameterized queries ($1, $2, ...) via this helper -
// this is what prevents SQL injection across the whole app.
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
