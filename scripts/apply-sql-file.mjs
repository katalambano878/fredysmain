/** Apply a SQL file using DATABASE_URL. Usage: node scripts/apply-sql-file.mjs path/to.sql */
import fs from 'fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-sql-file.mjs <file.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  max: 1,
});

try {
  await pool.query(sql);
  console.log(JSON.stringify({ ok: true, file }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(1);
} finally {
  await pool.end();
}
