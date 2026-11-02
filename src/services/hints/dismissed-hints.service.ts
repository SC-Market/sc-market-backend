/**
 * Dismissed inline help hints: one row per (user, hint key) in
 * user_dismissed_hints. A dismissed hint never shows again for that user.
 *
 * The frontend owns the hint keys, so they are validated by shape, not
 * against a list: a new hint needs no backend change. The per-user cap keeps
 * a script from filling the table.
 */

import type { Knex } from "knex"

/** Lower-case letters, digits, dots, dashes and underscores; at most 64. */
export const HINT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** Most hints one user may have dismissed. */
export const MAX_DISMISSED_HINTS = 500

export type DismissHintErrorCode = "invalid" | "limit"

/** A dismiss request the caller can fix; `message` is shown to the user. */
export class DismissHintError extends Error {
  constructor(
    public readonly code: DismissHintErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "DismissHintError"
  }
}

export interface DismissedHintRow {
  hint_key: string
  dismissed_at: Date
}

export function isValidHintKey(key: string): boolean {
  return HINT_KEY_PATTERN.test(key)
}

/** The user's dismissed hint keys, oldest first. */
export async function listDismissedHints(
  db: Knex,
  userId: string,
): Promise<string[]> {
  const rows: DismissedHintRow[] = await db("user_dismissed_hints")
    .where({ user_id: userId })
    .orderBy("dismissed_at", "asc")
    .select("hint_key", "dismissed_at")
  return rows.map((r) => r.hint_key)
}

/**
 * Record that the user dismissed `hintKey`. Idempotent: dismissing it again
 * keeps the first dismissal time.
 */
export async function dismissHint(
  db: Knex,
  userId: string,
  hintKey: string,
): Promise<DismissedHintRow> {
  if (!isValidHintKey(hintKey)) {
    throw new DismissHintError("invalid", "Unknown hint key")
  }
  const existing: DismissedHintRow | undefined = await db(
    "user_dismissed_hints",
  )
    .where({ user_id: userId, hint_key: hintKey })
    .first("hint_key", "dismissed_at")
  if (existing) return existing

  const dismissed = await db("user_dismissed_hints")
    .where({ user_id: userId })
    .select("hint_key")
  if (dismissed.length >= MAX_DISMISSED_HINTS) {
    throw new DismissHintError("limit", "Too many dismissed hints")
  }

  await db("user_dismissed_hints")
    .insert({ user_id: userId, hint_key: hintKey, dismissed_at: new Date() })
    .onConflict(["user_id", "hint_key"])
    .ignore()

  const row: DismissedHintRow | undefined = await db("user_dismissed_hints")
    .where({ user_id: userId, hint_key: hintKey })
    .first("hint_key", "dismissed_at")
  return row!
}
