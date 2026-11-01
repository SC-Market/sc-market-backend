import { describe, expect, it } from "vitest"
import { discordDmDisabled } from "./kill-switch.js"

describe("discordDmDisabled", () => {
  it("off unless the event is listed", () => {
    expect(discordDmDisabled("reminder.unread_messages", {})).toBe(false)
    expect(discordDmDisabled("reminder.unread_messages", { DISCORD_DM_DISABLED_EVENTS: "" })).toBe(false)
    expect(discordDmDisabled("reminder.unread_messages", { DISCORD_DM_DISABLED_EVENTS: "listing.expiring" })).toBe(false)
  })
  it("comma-separated list, whitespace tolerant, * for all", () => {
    const env = { DISCORD_DM_DISABLED_EVENTS: " listing.expiring , reminder.unread_messages" }
    expect(discordDmDisabled("reminder.unread_messages", env)).toBe(true)
    expect(discordDmDisabled("listing.expiring", env)).toBe(true)
    expect(discordDmDisabled("watchlist.price_alert", { DISCORD_DM_DISABLED_EVENTS: "*" })).toBe(true)
  })
})
