// Seed the first admin user. After that, manage users at /admin/users.
//
//   node scripts/create-admin.mjs <email> "<Full Name>" <password>
//
// Uses the same PG env vars / defaults as the app (see lib/db.js).
import pg from "pg";
import bcrypt from "bcryptjs";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error('Usage: node scripts/create-admin.mjs <email> "<Full Name>" <password>');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "/tmp",
  port: Number(process.env.PGPORT ?? 5433),
  database: process.env.PGDATABASE ?? "ai_pulse",
  user: process.env.PGUSER ?? "pulse",
});

const hash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE SET name = $2, password_hash = $3, role = 'admin'`,
  [email.toLowerCase(), name, hash]
);
console.log(`Admin user ${email.toLowerCase()} created/updated.`);
await pool.end();
