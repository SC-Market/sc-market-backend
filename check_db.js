import knex from 'knex';
import config from './knexfile.ts';

const db = knex(config.development);

async function check() {
  try {
    // Check if game_items table exists
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%game%item%'
      ORDER BY table_name;
    `);
    console.log('Tables with "game" and "item":', tables.rows);
    
    // Check game_items structure if it exists
    if (tables.rows.length > 0) {
      const cols = await db.raw(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'game_items'
        ORDER BY ordinal_position
        LIMIT 10;
      `);
      console.log('\ngame_items columns:', cols.rows);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

check();
