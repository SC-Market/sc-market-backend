/**
 * Price alert (watchlist) notification preferences: one toggle per channel.
 */
export interface PriceAlertPreferences {
  /** In-app notification on the site. Default: on. */
  site: boolean
  /** Web push to the user's subscribed browsers / installed PWA. Default: on. */
  push: boolean
  /** Email to the user's verified primary address. Default: off (opt-in). */
  email: boolean
  /** Direct message from the SC Market Discord bot. Default: on. */
  discord: boolean
}

/** Channels to change; omitted channels keep their current setting. */
export interface UpdatePriceAlertPreferencesRequest {
  site?: boolean
  push?: boolean
  email?: boolean
  discord?: boolean
}
