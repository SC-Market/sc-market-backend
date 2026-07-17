import type { Knex } from "knex"

/**
 * Seeds the `market_v2_redesign` feature flag into feature_flag_config so it
 * becomes a first-class flag: it appears in the `flags` map returned by
 * GET /api/v2/debug/feature-flag, and supports a global default / percentage
 * rollout. Per-user overrides already work without this row, but the flag only
 * surfaces in the flags map once a config row exists (getAllFlags iterates
 * feature_flag_config rows only). There is no API to create this row, so it is
 * seeded via migration — the same way market_v2/crafting/wiki were.
 *
 * See sc-market-frontend/docs/feature-flags.md for the full onboarding guide.
 */
export async function up(knex: Knex): Promise<void> {
  const existing = await knex("feature_flag_config")
    .where("flag_name", "market_v2_redesign")
    .first()

  if (!existing) {
    await knex("feature_flag_config").insert({
      flag_name: "market_v2_redesign",
      enabled: false, // off by default; enable per-user override or roll out gradually
      default_version: "V1",
      rollout_percentage: 0,
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flag_config").where("flag_name", "market_v2_redesign").del()
}
