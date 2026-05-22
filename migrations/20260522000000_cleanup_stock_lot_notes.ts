import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex("listing_item_lots")
    .where("notes", "like", "Migrated from V1 listing%")
    .update({ notes: null })

  await knex("listing_item_lots")
    .where("notes", "like", "Allocated from lot%")
    .update({ notes: null })
}

export async function down(_knex: Knex): Promise<void> {
  // Notes cannot be restored
}
