import type { Knex } from "knex"

/**
 * Inventory Decoupling — ALTER listing_item_lots in place.
 *
 * Adds owner_id, game_item_id, listing_id columns so lots can exist
 * as personal inventory without being tied to a listing.
 *
 * Steps:
 * 1. Add new nullable columns
 * 2. Backfill from existing listing_items + listings relationships
 * 3. Make owner_id NOT NULL
 * 4. Make item_id nullable (lots no longer require a listing_item)
 * 5. Add indexes
 * 6. Update quantity trigger to handle lot movement between listings
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Add new columns individually (check each one)
  if (!(await knex.schema.hasColumn("listing_item_lots", "game_item_id"))) {
    await knex.raw(`ALTER TABLE listing_item_lots ADD COLUMN game_item_id UUID`)
  }
  if (!(await knex.schema.hasColumn("listing_item_lots", "listing_id"))) {
    await knex.raw(`ALTER TABLE listing_item_lots ADD COLUMN listing_id UUID`)
  }

  // 2. Backfill game_item_id and listing_id from existing relationships
  await knex.raw(`
    UPDATE listing_item_lots lil
    SET
      game_item_id = li.game_item_id,
      listing_id = li.listing_id
    FROM listing_items li
    WHERE lil.item_id = li.item_id
      AND lil.game_item_id IS NULL
  `)

  // 3. Backfill owner_id where NULL (from listing seller)
  await knex.raw(`
    UPDATE listing_item_lots lil
    SET owner_id = l.seller_id
    FROM listing_items li
    JOIN listings l ON li.listing_id = l.listing_id
    WHERE lil.item_id = li.item_id
      AND lil.owner_id IS NULL
  `)

  // 4. Make owner_id NOT NULL if all rows have been backfilled
  const stillNull = await knex("listing_item_lots").whereNull("owner_id").count("* as count")
  if (Number(stillNull[0].count) === 0) {
    await knex.raw(`ALTER TABLE listing_item_lots ALTER COLUMN owner_id SET NOT NULL`)
  } else {
    console.warn(`${stillNull[0].count} lots still have NULL owner_id — skipping NOT NULL constraint`)
  }

  // 5. Make item_id nullable (lots no longer require a listing_item)
  await knex.raw(`ALTER TABLE listing_item_lots ALTER COLUMN item_id DROP NOT NULL`)

  // 6. Add indexes
  const indexExists = await knex.raw(`
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_listing_item_lots_owner_id'
  `)
  if (indexExists.rows.length === 0) {
    await knex.raw(`CREATE INDEX idx_listing_item_lots_owner_id ON listing_item_lots(owner_id)`)
    await knex.raw(`CREATE INDEX idx_listing_item_lots_game_item_id ON listing_item_lots(game_item_id) WHERE game_item_id IS NOT NULL`)
    await knex.raw(`CREATE INDEX idx_listing_item_lots_listing_id ON listing_item_lots(listing_id) WHERE listing_id IS NOT NULL`)
  }

  // 7. Update quantity trigger to handle lot movement between listings
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_quantity_available()
    RETURNS TRIGGER AS $$
    DECLARE
      affected_item_id UUID;
      old_item_id UUID;
    BEGIN
      affected_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
      old_item_id := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.item_id ELSE NULL END;

      -- Update the current listing_item
      IF affected_item_id IS NOT NULL THEN
        UPDATE listing_items
        SET
          quantity_available = (
            SELECT COALESCE(SUM(quantity_total), 0)
            FROM listing_item_lots
            WHERE item_id = affected_item_id AND listed = true
          ),
          variant_count = (
            SELECT COUNT(DISTINCT variant_id)
            FROM listing_item_lots
            WHERE item_id = affected_item_id AND listed = true
          )
        WHERE item_id = affected_item_id;
      END IF;

      -- If lot moved between listing_items, also update the old one
      IF TG_OP = 'UPDATE' AND old_item_id IS DISTINCT FROM NEW.item_id AND old_item_id IS NOT NULL THEN
        UPDATE listing_items
        SET
          quantity_available = (
            SELECT COALESCE(SUM(quantity_total), 0)
            FROM listing_item_lots
            WHERE item_id = old_item_id AND listed = true
          ),
          variant_count = (
            SELECT COUNT(DISTINCT variant_id)
            FROM listing_item_lots
            WHERE item_id = old_item_id AND listed = true
          )
        WHERE item_id = old_item_id;
      END IF;

      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $$ LANGUAGE plpgsql;
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Restore item_id NOT NULL
  await knex.raw(`ALTER TABLE listing_item_lots ALTER COLUMN item_id SET NOT NULL`)

  // Drop indexes
  await knex.raw(`DROP INDEX IF EXISTS idx_listing_item_lots_owner_id`)
  await knex.raw(`DROP INDEX IF EXISTS idx_listing_item_lots_game_item_id`)
  await knex.raw(`DROP INDEX IF EXISTS idx_listing_item_lots_listing_id`)

  // Drop columns (only the ones we added)
  await knex.schema.alterTable("listing_item_lots", (table) => {
    table.dropColumn("game_item_id")
    table.dropColumn("listing_id")
  })

  // Restore original trigger
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_quantity_available()
    RETURNS TRIGGER AS $$
    BEGIN
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
}
