import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create function to update quantity_available and variant_count
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_quantity_available()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Update the listing_items table with computed values
      UPDATE listing_items
      SET 
        quantity_available = (
          SELECT COALESCE(SUM(quantity_total), 0)
          FROM listing_item_lots
          WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
            AND listed = true
        ),
        variant_count = (
          SELECT COUNT(DISTINCT variant_id)
          FROM listing_item_lots
          WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
            AND listed = true
        )
      WHERE item_id = COALESCE(NEW.item_id, OLD.item_id);
      
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `)

  // Create trigger on listing_item_lots for INSERT, UPDATE, DELETE
  await knex.raw(`
    CREATE TRIGGER trg_listing_item_lots_quantity
    AFTER INSERT OR UPDATE OR DELETE ON listing_item_lots
    FOR EACH ROW
    EXECUTE PROCEDURE update_quantity_available();
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop trigger first
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_listing_item_lots_quantity ON listing_item_lots;
  `)

  // Drop function
  await knex.raw(`
    DROP FUNCTION IF EXISTS update_quantity_available();
  `)
}
