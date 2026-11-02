/**
 * Optional feedback on the "Still selling?" landing page (dm_campaign_feedback,
 * migration 20261103000000). Never required.
 *
 * - After "Pause them": "Mind telling us why?" Any of PAUSE_REASONS, plus
 *   optional free text for about_sc_market and other.
 * - After "Keep them live": "Anything that would make selling here easier?"
 *   Free text.
 *
 * One answer per link (token_id = sha256 of the token, UNIQUE). A real link
 * needs its dm_campaign_recipients row; a test link stores is_test = true,
 * kept apart from the real counts. Free text: HTML tags and control
 * characters stripped, whitespace collapsed, at most MAX_TEXT characters.
 * Admin-only summary (feedbackSummary): counts per reason and the free text
 * with its date and the author's display name.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { tokenId, verifyCampaignActionToken } from "./campaign-action-token.js"

export const PAUSE_REASONS = [
  "not_playing",
  "waiting_patch",
  "not_enough_buyers",
  "selling_elsewhere",
  "too_much_work",
  "about_sc_market",
  "other",
] as const
export type PauseReason = (typeof PAUSE_REASONS)[number]

export const MAX_TEXT = 500

/** Plain text: no HTML, no control characters, whitespace collapsed, capped. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw
    .replace(/<[^>]*>?/g, " ")
    .replace(/[<>]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_TEXT)
    .trim()
  return text || null
}

export interface FeedbackInput {
  reasons?: string[]
  about_sc_market?: string
  other_text?: string
  easier_text?: string
}

export type FeedbackResult =
  | { ok: true; test: boolean }
  | {
      ok: false
      reason: "invalid" | "expired" | "already" | "empty" | "bad_request"
    }

export async function submitFeedback(
  token: string,
  input: FeedbackInput,
  db: Knex = getKnex(),
  now = new Date(),
): Promise<FeedbackResult> {
  const verified = verifyCampaignActionToken(token, { now })
  if (!verified.ok) return verified
  const { campaign, userId, action, test } = verified.claim
  if (!test) {
    const row = await db("dm_campaign_recipients")
      .where({ campaign, user_id: userId })
      .first("user_id")
    if (!row) return { ok: false, reason: "invalid" }
  }
  let reasons: PauseReason[] = []
  let about: string | null = null
  let other: string | null = null
  let easier: string | null = null
  if (action === "pause") {
    const raw = Array.isArray(input.reasons) ? input.reasons : []
    if (raw.length > PAUSE_REASONS.length)
      return { ok: false, reason: "bad_request" }
    for (const r of raw) {
      if (!(PAUSE_REASONS as readonly string[]).includes(r)) {
        return { ok: false, reason: "bad_request" }
      }
    }
    reasons = [...new Set(raw)] as PauseReason[]
    about = cleanText(input.about_sc_market)
    other = cleanText(input.other_text)
    if (!reasons.length && !about && !other)
      return { ok: false, reason: "empty" }
  } else {
    easier = cleanText(input.easier_text)
    if (!easier) return { ok: false, reason: "empty" }
  }
  const inserted = await db.raw(
    `
    INSERT INTO dm_campaign_feedback
      (campaign, user_id, action, token_id, is_test, reasons, about_sc_market, other_text, easier_text)
    VALUES (?, ?, ?, ?, ?, ?::text[], ?, ?, ?)
    ON CONFLICT (token_id) DO NOTHING
    RETURNING feedback_id
    `,
    [
      campaign,
      userId,
      action,
      tokenId(token),
      test,
      reasons,
      about,
      other,
      easier,
    ],
  )
  if (!inserted?.rows?.length) return { ok: false, reason: "already" }
  return { ok: true, test }
}

export interface FeedbackText {
  created_at: string
  display_name: string
  action: "keep" | "pause"
  field: "about_sc_market" | "other" | "easier"
  text: string
}

export interface FeedbackGroup {
  responses: number
  reasons: Record<PauseReason, number>
  texts: FeedbackText[]
}

const emptyReasons = (): Record<PauseReason, number> =>
  Object.fromEntries(PAUSE_REASONS.map((r) => [r, 0])) as Record<
    PauseReason,
    number
  >

/** Admin summary: real and test answers kept apart. */
export async function feedbackSummary(
  campaign: string,
  db: Knex = getKnex(),
  maxTexts = 200,
): Promise<{ real: FeedbackGroup; test: FeedbackGroup }> {
  const groups = { real: emptyGroup(), test: emptyGroup() }
  const counts = await db.raw(
    `
    SELECT is_test, COUNT(*)::integer AS responses FROM dm_campaign_feedback
    WHERE campaign = ? GROUP BY is_test
    `,
    [campaign],
  )
  for (const r of (counts?.rows ?? []) as {
    is_test: boolean
    responses: number
  }[]) {
    groups[r.is_test ? "test" : "real"].responses = Number(r.responses) || 0
  }
  const reasons = await db.raw(
    `
    SELECT is_test, reason, COUNT(*)::integer AS n
    FROM dm_campaign_feedback, unnest(reasons) AS reason
    WHERE campaign = ?
    GROUP BY is_test, reason
    `,
    [campaign],
  )
  for (const r of (reasons?.rows ?? []) as {
    is_test: boolean
    reason: string
    n: number
  }[]) {
    if ((PAUSE_REASONS as readonly string[]).includes(r.reason)) {
      groups[r.is_test ? "test" : "real"].reasons[r.reason as PauseReason] =
        Number(r.n) || 0
    }
  }
  const texts = await db.raw(
    `
    SELECT f.created_at, f.is_test, f.action, a.display_name,
           f.about_sc_market, f.other_text, f.easier_text
    FROM dm_campaign_feedback f
    JOIN accounts a ON a.user_id = f.user_id
    WHERE f.campaign = ?
      AND (f.about_sc_market IS NOT NULL OR f.other_text IS NOT NULL OR f.easier_text IS NOT NULL)
    ORDER BY f.created_at DESC
    LIMIT ?
    `,
    [campaign, maxTexts],
  )
  for (const r of (texts?.rows ?? []) as {
    created_at: Date | string
    is_test: boolean
    action: "keep" | "pause"
    display_name: string | null
    about_sc_market: string | null
    other_text: string | null
    easier_text: string | null
  }[]) {
    const base = {
      created_at: new Date(r.created_at).toISOString(),
      display_name: r.display_name || "(no display name)",
      action: r.action,
    }
    const g = groups[r.is_test ? "test" : "real"]
    if (r.about_sc_market)
      g.texts.push({
        ...base,
        field: "about_sc_market",
        text: r.about_sc_market,
      })
    if (r.other_text)
      g.texts.push({ ...base, field: "other", text: r.other_text })
    if (r.easier_text)
      g.texts.push({ ...base, field: "easier", text: r.easier_text })
  }
  return groups

  function emptyGroup(): FeedbackGroup {
    return { responses: 0, reasons: emptyReasons(), texts: [] }
  }
}
