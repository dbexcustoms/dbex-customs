// One-off script to promote/create the first admin user.
// Usage: node src/createAdmin.js admin@example.com SomeStrongPassword123 "Admin Name"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password || !fullName) {
    console.error('Usage: node src/createAdmin.js <email> <password> "<full name>"');
    process.exit(1);
  }
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing.rows.length) {
    await query('UPDATE users SET role = $1, password_hash = $2 WHERE email = $3', ['admin', passwordHash, email]);
    console.log(`Existing user ${email} promoted to admin.`);
  } else {
    await query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'admin')`,
      [email, passwordHash, fullName]
    );
    console.log(`Admin user ${email} created.`);
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
