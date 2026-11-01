/**
 * Mission item rewards -> game_items.
 *
 * `missions.item_rewards` holds the game files' references, not wiki ids:
 *
 *   { "name": "Anvil F7 Hornet Mk Wikelo",
 *     "ref": "file://./../../libs/foundry/records/entities/spaceships/anvl_hornet_f7_mk2_collector_mod.json",
 *     "itemId": "41494cbf-8d90-4bb5-abd3-3b20cd694fc9" }
 *
 * - `itemId` (when the extractor resolved it) is the entity record UUID,
 *   stored as game_items.p4k_id (unique).
 * - The basename of `ref` is the record's class name, stored as
 *   game_items.p4k_file.
 *
 * Resolution is exact, never by display name: the p4k_id match wins; else a
 * p4k_file match counts only when exactly one game item has that file (two
 * items with one file is ambiguous, so the reward stays unresolved). An
 * unresolved reward gets game_item_id null.
 *
 * rewardKeys() mirrors the SQL function mission_item_reward_keys() of
 * migration 20261031120000, whose GIN index serves the reverse lookup
 * ("missions that reward this item"). Keep the two in step.
 */

import type { Knex } from "knex"
import { formatShortSlug } from "../../api/routes/v2/util/short-slug.js"

/** One element of missions.item_rewards, as stored. */
export interface StoredItemReward {
  name?: string
  ref?: string
  itemId?: string
}

/** A resolved game item. */
export interface ResolvedRewardItem {
  id: string
  slug: string
  name: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Record class name of a ref: basename without ".json", lower case. */
export function refClassName(ref: unknown): string | null {
  if (typeof ref !== "string" || ref.length === 0) return null
  const base = ref
    .replace(/^.*\//, "")
    .replace(/\.json$/i, "")
    .toLowerCase()
  return base.length > 0 ? base : null
}

/** The p4k_id of a reward, lower case, when it is a UUID. */
export function rewardP4kId(reward: StoredItemReward): string | null {
  return typeof reward.itemId === "string" && UUID.test(reward.itemId)
    ? reward.itemId.toLowerCase()
    : null
}

/** Index keys of one reward: `id:<p4k_id>` and `file:<class name>`. */
export function rewardKeys(reward: StoredItemReward): string[] {
  const keys: string[] = []
  const id = rewardP4kId(reward)
  if (id) keys.push(`id:${id}`)
  const file = refClassName(reward.ref)
  if (file) keys.push(`file:${file}`)
  return keys
}

/** Index keys of a game item (what a reward of it would carry). */
export function itemKeys(item: {
  p4k_id: string | null
  p4k_file: string | null
}): string[] {
  const keys: string[] = []
  if (item.p4k_id && UUID.test(item.p4k_id))
    keys.push(`id:${item.p4k_id.toLowerCase()}`)
  const file = item.p4k_file ? item.p4k_file.toLowerCase() : ""
  if (file) keys.push(`file:${file}`)
  return keys
}

/**
 * missions.item_rewards as an array: jsonb arrives parsed, or as text when
 * the driver hands back raw JSON. Anything else is no rewards.
 */
export function parseStoredRewards(value: unknown): StoredItemReward[] {
  let v = value
  if (typeof v === "string") {
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  if (!Array.isArray(v)) return []
  return v.filter(
    (r): r is StoredItemReward => typeof r === "object" && r !== null,
  )
}

interface CandidateRow {
  id: string
  name: string
  p4k_id: string | null
  p4k_file_lower: string | null
}

/**
 * Resolves rewards to game items with one indexed query (p4k_id, and
 * lower(p4k_file) via idx_game_items_p4k_file_lower). Returns one entry per
 * reward, in order: the item, or null when it doesn't resolve exactly.
 */
export async function resolveItemRewards(
  knex: Knex,
  rewards: readonly StoredItemReward[],
): Promise<(ResolvedRewardItem | null)[]> {
  const ids = new Set<string>()
  const files = new Set<string>()
  for (const r of rewards) {
    const id = rewardP4kId(r)
    if (id) ids.add(id)
    const file = refClassName(r.ref)
    if (file) files.add(file)
  }
  if (ids.size === 0 && files.size === 0) return rewards.map(() => null)

  const rows = (await knex("game_items")
    .select(
      "id",
      "name",
      "p4k_id",
      knex.raw("lower(p4k_file) AS p4k_file_lower"),
    )
    .where((q) => {
      // knex expands an array binding into a list, hence ARRAY[?].
      if (ids.size) q.orWhereRaw("p4k_id = ANY(ARRAY[?]::uuid[])", [[...ids]])
      if (files.size)
        q.orWhereRaw("lower(p4k_file) = ANY(ARRAY[?]::text[])", [[...files]])
    })) as CandidateRow[]

  const byId = new Map<string, CandidateRow>()
  const byFile = new Map<string, CandidateRow[]>()
  for (const row of rows) {
    if (row.p4k_id) byId.set(String(row.p4k_id).toLowerCase(), row)
    if (row.p4k_file_lower) {
      const list = byFile.get(row.p4k_file_lower) ?? []
      list.push(row)
      byFile.set(row.p4k_file_lower, list)
    }
  }

  return rewards.map((r) => {
    const id = rewardP4kId(r)
    let hit = id ? byId.get(id) : undefined
    if (!hit) {
      const file = refClassName(r.ref)
      const matches = file ? byFile.get(file) : undefined
      if (matches && matches.length === 1) hit = matches[0]
    }
    return hit
      ? { id: hit.id, slug: formatShortSlug(hit.id, hit.name), name: hit.name }
      : null
  })
}
