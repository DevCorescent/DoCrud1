import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to initialize the database schema.');
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
const schemaSql = await readFile(schemaPath, 'utf8');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(schemaSql);
  console.log('Database schema initialized successfully.');
} finally {
  await pool.end();
}
