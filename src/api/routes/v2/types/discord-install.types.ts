/** Where an "Add SC Market to Discord" link was (services/discord/install-clicks.ts INSTALL_SOURCES). */
export type DiscordInstallSource =
  | "settings_notifications"
  | "settings_discord"
  | "org_discord"
  | "shop_dashboard"
  | "shop_settings"
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

/** A channel of a linked server that can get order threads or alerts. */
export interface LinkedDiscordChannel {
  channel_id: string
  name: string
  /** text: threads and alerts; forum: threads (as posts); announcement: alerts. */
  kind: "text" | "forum" | "announcement"
}

/** A Discord server linked to a shop or org by adding the bot from its settings. */
export interface LinkedDiscordServer {
  guild_id: string
  /** null when the bot can't read the server (it was removed). */
  name: string | null
  icon_url: string | null
  /** false when the bot is no longer in the server. */
  bot_in_server: boolean
  /** Channels that can get threads or alerts, by position. */
  channels: LinkedDiscordChannel[]
  /** The owner's order-thread channel, when it is in this server. */
  thread_channel_id: string | null
  /** The owner's order-alert channels in this server. */
  alert_channel_ids: string[]
}

export interface LinkedDiscordServersResponse {
  servers: LinkedDiscordServer[]
}

export interface UpdateLinkedDiscordServerRequest {
  /** The shop (shop id) the server is linked to; give this or org. */
  shop?: string
  /** The org (Spectrum ID) the server is linked to; give this or shop. */
  org?: string
  /** The order-thread channel: a channel id, null to stop threads in this server, or omit to keep. */
  thread_channel_id?: string | null
  /** Exactly the alert channels in this server; omit to keep. */
  alert_channel_ids?: string[]
}
