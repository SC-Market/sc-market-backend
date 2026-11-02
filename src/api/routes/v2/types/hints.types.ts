/**
 * Inline help hints (first-use cards) the signed-in user has dismissed.
 * Hint keys are chosen by the frontend; a dismissed hint never shows again.
 */

export interface DismissedHintsResponse {
  /** Keys of every hint this user has dismissed. */
  hint_keys: string[]
}

export interface DismissedHint {
  /** The dismissed hint's key, e.g. "stock.lots-vs-quantity". */
  hint_key: string
  /** When the user first dismissed it. */
  dismissed_at: string
}
