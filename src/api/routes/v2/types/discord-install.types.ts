/** Where an "Add SC Market to Discord" link was (services/discord/install-clicks.ts INSTALL_SOURCES). */
export type DiscordInstallSource =
  | "settings_notifications"
  | "settings_discord"
  | "org_discord"
  | "shop_dashboard"
  | "shop_hint"
  | "guide"
  | "faq"
  | "footer"
  | "other"

export interface DiscordInstallClickRequest {
  /** user: install on your own Discord account; server: add the bot to a server. */
  type: "user" | "server"
  /** The surface the link was on; unknown values count as "other". */
  src: string
}

export interface DiscordInstallClickCount {
  install_type: "user" | "server"
  src: DiscordInstallSource
  /** Clicks in the last 7 days (today included). */
  clicks_7d: number
  /** Clicks in the last 30 days (today included). */
  clicks_30d: number
}
