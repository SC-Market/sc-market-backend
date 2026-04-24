/** @type {import('knex').Knex.Migration} */
const up = async (knex) => {
  const cols = [
    ["destinations", "jsonb"],
    ["item_rewards", "jsonb"],
    ["token_substitutions", "jsonb"],
    ["time_to_complete", "real"],
    ["max_players_per_instance", "integer"],
    ["is_intro", "boolean DEFAULT false"],
    ["linked_intros", "jsonb"],
    ["buy_in", "integer"],
    ["reputation_reward", "integer"],
    ["reward_scope", "varchar(200)"],
  ]
  for (const [col, type] of cols) {
    await knex.raw(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
}

const down = async (knex) => {
  const cols = ["destinations", "item_rewards", "token_substitutions", "time_to_complete",
    "max_players_per_instance", "is_intro", "linked_intros", "buy_in", "reputation_reward", "reward_scope"]
  for (const col of cols) {
    await knex.raw(`ALTER TABLE missions DROP COLUMN IF EXISTS ${col}`)
  }
}

module.exports = { up, down }
