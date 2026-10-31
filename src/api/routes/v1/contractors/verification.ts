/**
 * Org (contractor) verification against the RSI org page.
 *
 * Verification looks only for the owner's sentinel code
 * ("[sc-market.space:XXXXXXXX]"). Owners may also keep an optional link-back
 * line ("Find our shop on SC Market: https://sc-market.space/contractor/<SID>",
 * in any locale) on their RSI page; it is never required and can never pass
 * as the sentinel (it has no "[sc-market.space:" prefix).
 */

/** Whether any RSI org text field contains the sentinel (case-insensitive). */
export function orgTextHasSentinel(
  fields: string[],
  sentinel: string,
): boolean {
  const needle = sentinel.toUpperCase()
  return fields.some((field) => field.toUpperCase().includes(needle))
}

/** Lines linking back to an org's SC Market profile. */
const LINK_BACK_LINE = /^.*sc-market\.space\/contractor\/.*$/gim

/**
 * The RSI text we store as the org description at verification: the sentinel
 * code (plain or markdown-escaped) and the optional link-back line removed,
 * since neither belongs in the description shown on SC Market itself.
 */
export function cleanVerifiedOrgDescription(text: string): string {
  return text
    .replace(/\\?\[sc-market\.space:[A-Z0-9]{8}\\?\]/gi, "")
    .replace(LINK_BACK_LINE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
