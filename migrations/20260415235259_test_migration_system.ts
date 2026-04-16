import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('test_migration_table', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 255).notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('test_migration_table')
}

