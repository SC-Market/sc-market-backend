#!/bin/sh
set -e
cd /app

# Clean up stale V2 migration records that no longer have corresponding files.
# This handles the case where old V2 migrations were replaced with new ones.
node -e "
const knex = require('knex');
const fs = require('fs');
const path = require('path');
const dbConfig = JSON.parse(process.env.DATABASE_PASS || '{}');
const db = knex({
  client: 'pg',
  connection: {
    host: dbConfig.host || 'localhost',
    user: dbConfig.username || 'postgres',
    password: dbConfig.password || '',
    database: dbConfig.dbname || 'postgres',
    port: dbConfig.port || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
});
(async () => {
  try {
    const hasTable = await db.schema.hasTable('knex_migrations');
    if (!hasTable) { await db.destroy(); return; }
    const rows = await db('knex_migrations').select('name');
    const migDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migDir).map(f => f.replace(/\.[^.]+$/, ''));
    const stale = rows.filter(r => !files.some(f => r.name.replace(/\.[^.]+$/, '') === f));
    if (stale.length > 0) {
      const names = stale.map(r => r.name);
      await db('knex_migrations').whereIn('name', names).del();
      console.log('Cleaned up ' + names.length + ' stale migration records:', names);
    }
  } catch (e) { console.error('Migration cleanup warning:', e.message); }
  await db.destroy();
})();
"

# Apply pending DB migrations before serving
npm run migrate:latest

exec node dist/src/server.js
