import type { Knex } from "knex"

/**
 * MEDRUNNER's saved white-label theme: two owner-approved contrast fixes
 * (2026-11-09). The theme API refuses the edit because the site owner is not a
 * MEDRUNNER manager, so it is applied here once.
 *
 * - dark  palette.text.secondary  #6a7282 -> #99a1af  (heading/body text, WCAG AA)
 * - light palette.action.hover    #263d55e6 -> #263d5514 (hover tint that hid text)
 *
 * Guarded: each value is only changed if it still holds the old value, so an
 * edit Medrunner made since is never overwritten. Exactly one row is touched.
 */
const CHANGES = [
  { mode: "dark", group: "text", key: "secondary", from: "#6a7282", to: "#99a1af" },
  { mode: "light", group: "action", key: "hover", from: "#263d55e6", to: "#263d5514" },
] as const

type Theme = Record<string, { palette?: Record<string, Record<string, string>> }>

async function apply(knex: Knex, direction: "up" | "down"): Promise<void> {
  const row = await knex("org_themes as t")
    .join("contractors as c", "c.contractor_id", "t.contractor_id")
    .where("c.spectrum_id", "MEDRUNNER")
    .first("t.contractor_id", "t.theme_data")
  if (!row) {
    console.log("[medrunner_theme_contrast] no MEDRUNNER theme row; nothing to do")
    return
  }
  const theme: Theme =
    typeof row.theme_data === "string" ? JSON.parse(row.theme_data) : row.theme_data
  let changed = 0
  for (const c of CHANGES) {
    const [want, next] = direction === "up" ? [c.from, c.to] : [c.to, c.from]
    const group = theme[c.mode]?.palette?.[c.group]
    if (group && group[c.key]?.toLowerCase() === want) {
      group[c.key] = next
      changed++
    }
  }
  if (changed === 0) {
    console.log(`[medrunner_theme_contrast] ${direction}: values already differ; left alone`)
    return
  }
  const n = await knex("org_themes")
    .where({ contractor_id: row.contractor_id })
    .update({ theme_data: JSON.stringify(theme), updated_at: knex.fn.now() })
  if (n !== 1) throw new Error(`[medrunner_theme_contrast] expected 1 row, updated ${n}`)
  console.log(`[medrunner_theme_contrast] ${direction}: changed ${changed} value(s)`)
}

export async function up(knex: Knex): Promise<void> {
  await apply(knex, "up")
}

export async function down(knex: Knex): Promise<void> {
  await apply(knex, "down")
}
