import type { Knex } from "knex"

/**
 * White-label sidebar: the Organizations and Recruiting tabs (SC Market's org
 * directory and every org's recruiting posts) are now off unless the org
 * turns them on (owner decision 2026-11-09). A missing row means the
 * default; the settings page now saves only the toggles that differ from it.
 *
 * Until now every save wrote all five toggles, on unless unticked, so a
 * stored "on" can't be told from the old default: those rows are removed for
 * every org, which turns both tabs off. Orgs can turn them back on. Stored
 * "off" rows are the new default and are left alone. Logs the orgs changed.
 *
 * Not reversible: the deleted rows were defaults, not choices.
 */
const TABS = ["contractors", "recruiting"]

export async function up(knex: Knex): Promise<void> {
  const affected = await knex("org_sidebar_config as sc")
    .join("contractors as c", "c.contractor_id", "sc.contractor_id")
    .whereIn("sc.standard_tab_key", TABS)
    .where("sc.enabled", true)
    .distinct("c.spectrum_id")
    .orderBy("c.spectrum_id")
  const deleted = await knex("org_sidebar_config")
    .whereIn("standard_tab_key", TABS)
    .where("enabled", true)
    .del()
  console.log(
    `[whitelabel_directory_tabs_default_off] removed ${deleted} rows; orgs: ${
      affected.map((r: { spectrum_id: string }) => r.spectrum_id).join(", ") || "none"
    }`,
  )
}

export async function down(): Promise<void> {
  // The removed rows were saved defaults; there is nothing to restore.
}
