/**
 * The bot's /setup routes: what a Discord channel gets from SC Market (order
 * threads, order alerts) and for whom (an org, or the member themselves).
 *
 *   POST   /channel-setups              set up threads or alerts in a channel
 *   GET    /channel-setups/:channel_id  what a channel is set up for (/setup status)
 *   DELETE /channel-setups/:channel_id  turn threads or alerts off (/setup remove)
 *
 * The bot checks the member's Discord permission (Manage Channels); these
 * routes check the SC Market side.
 */
import express from "express"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import { isSiteAdmin } from "../../api/util/site-role.js"
import { DBContractor, DBContractorRole } from "../database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"
import logger from "../../logger/logger.js"
import {
  ChannelSetupView,
  DiscordSetupKind,
  DiscordSetupOwner,
  addAlertChannel,
  getSetup,
  listChannel,
  removeKind,
  setThreadChannel,
} from "../../services/discord/channel-setups.js"
import { getKnex } from "../database/knex-db.js"

export const channelSetupRouter = express.Router()

const DISCORD_ID = /^[0-9]{15,22}$/
const KINDS: DiscordSetupKind[] = ["threads", "alerts"]

const NOT_LINKED =
  "Your Discord account isn't linked to SC Market. Log in at https://sc-market.space with Discord " +
  "(or link Discord in your account settings there), then try again."

/** The SC Market org permissions that let a member manage each kind for the org. */
const ORG_PERMISSIONS: Record<DiscordSetupKind, (keyof DBContractorRole)[]> = {
  threads: ["manage_webhooks"],
  alerts: ["manage_orders", "manage_webhooks"],
}
const ORG_PERMISSION_LABELS: Record<DiscordSetupKind, string> = {
  threads: "Manage Webhooks",
  alerts: "Manage Orders or Manage Webhooks",
}
const KIND_LABELS: Record<DiscordSetupKind, string> = {
  threads: "order threads",
  alerts: "order alerts",
}

class SetupError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function orgPermitted(
  contractor_id: string,
  user_id: string,
  kind: DiscordSetupKind,
): Promise<boolean> {
  for (const permission of ORG_PERMISSIONS[kind]) {
    if (await has_permission(contractor_id, user_id, permission)) return true
  }
  return false
}

async function findOrg(spectrum_id: string): Promise<DBContractor> {
  let contractor: DBContractor | null | undefined
  try {
    contractor = await contractorDb.getContractor({ spectrum_id })
  } catch {
    contractor = null
  }
  if (!contractor) {
    throw new SetupError(404, `No org with the Spectrum ID ${spectrum_id} is on SC Market.`)
  }
  return contractor
}

function parseKind(value: unknown): DiscordSetupKind {
  if (typeof value === "string" && (KINDS as string[]).includes(value)) {
    return value as DiscordSetupKind
  }
  throw new SetupError(400, "kind must be threads or alerts")
}

function requireDiscordId(value: unknown, name: string): string {
  if (typeof value === "string" && DISCORD_ID.test(value)) return value
  throw new SetupError(400, `${name} is required`)
}

function spectrumIdOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function sendError(res: express.Response, e: unknown, what: string) {
  if (e instanceof SetupError) {
    res.status(e.status).json({ error: e.message })
    return
  }
  logger.error(`Discord channel setup: failed to ${what}`, { error: e })
  res.status(500).json({ error: `Couldn't ${what}. Please try again in a moment.` })
}

/** "order alerts for SC Market (SCMARKET)" lines for a channel. */
function describeChannel(setups: ChannelSetupView[]): string {
  return setups
    .flatMap((s) =>
      KINDS.filter((k) => s[k]).map((k) => `${KIND_LABELS[k]} for ${s.owner_label}`),
    )
    .join(", ")
}

channelSetupRouter.post("/", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const discord_id = requireDiscordId(body.discord_id, "discord_id")
    const channel_id = requireDiscordId(body.channel_id, "channel_id")
    const guild_id = requireDiscordId(body.guild_id, "guild_id")
    const kind = parseKind(body.kind)
    const spectrum_id = spectrumIdOf(body.spectrum_id)

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) throw new SetupError(403, NOT_LINKED)

    let owner: DiscordSetupOwner
    let owner_label: string
    if (spectrum_id) {
      const org = await findOrg(spectrum_id)
      if (!(await orgPermitted(org.contractor_id, user.user_id, kind))) {
        throw new SetupError(
          403,
          `You need the ${ORG_PERMISSION_LABELS[kind]} permission in ${org.name} on SC Market ` +
            `to set up its ${KIND_LABELS[kind]}. An org admin can grant it under the org's Roles.`,
        )
      }
      owner = { owner_type: "org", owner_id: org.contractor_id }
      owner_label = `${org.name} (${org.spectrum_id})`
    } else {
      owner = { owner_type: "user", owner_id: user.user_id }
      owner_label = user.username
    }

    let moved_from: { guild_id: string; channel_id: string } | null = null
    if (kind === "threads") {
      moved_from = await setThreadChannel(owner, { guild_id, channel_id }, discord_id)
    } else {
      await addAlertChannel(owner, { guild_id, channel_id }, discord_id)
    }

    logger.info("Discord channel setup saved", {
      kind,
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      channel_id,
    })
    res.json({ data: { kind, owner_type: owner.owner_type, owner_label, moved_from } })
  } catch (e) {
    sendError(res, e, "save this channel's setup")
  }
})

channelSetupRouter.get("/:channel_id", async (req, res) => {
  try {
    const channel_id = requireDiscordId(req.params.channel_id, "channel_id")
    res.json({ data: await listChannel(channel_id) })
  } catch (e) {
    sendError(res, e, "load this channel's setup")
  }
})

channelSetupRouter.delete("/:channel_id", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const channel_id = requireDiscordId(req.params.channel_id, "channel_id")
    const discord_id = requireDiscordId(body.discord_id, "discord_id")
    const kind = parseKind(body.kind)
    const spectrum_id = spectrumIdOf(body.spectrum_id)

    const user: User | null = await profileDb.getUserByDiscordId(discord_id)

    let owner: DiscordSetupOwner
    let owner_label: string
    let org: DBContractor | null = null
    if (spectrum_id) {
      org = await findOrg(spectrum_id)
      owner = { owner_type: "org", owner_id: org.contractor_id }
      owner_label = `${org.name} (${org.spectrum_id})`
    } else {
      if (!user) throw new SetupError(403, NOT_LINKED)
      owner = { owner_type: "user", owner_id: user.user_id }
      owner_label = "you"
    }

    const row = await getSetup(owner, channel_id)
    if (!row || !row[kind]) {
      const here = describeChannel(await listChannel(channel_id))
      throw new SetupError(
        404,
        `This channel has no ${KIND_LABELS[kind]} for ${owner_label}.` +
          (here ? ` It has: ${here}.` : " Nothing is set up here."),
      )
    }

    const allowed =
      row.created_by_discord_id === discord_id ||
      (!!user &&
        (org
          ? await orgPermitted(org.contractor_id, user.user_id, kind)
          : owner.owner_id === user.user_id || isSiteAdmin(user)))
    if (!allowed) {
      throw new SetupError(
        403,
        org
          ? `You need the ${ORG_PERMISSION_LABELS[kind]} permission in ${org.name} on SC Market ` +
              `to remove its ${KIND_LABELS[kind]}, or to be the one who set them up.`
          : "Only the member who set this up can remove it.",
      )
    }

    await removeKind(getKnex(), row, kind)
    logger.info("Discord channel setup removed", {
      kind,
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      channel_id,
    })
    res.json({ data: { kind, owner_label } })
  } catch (e) {
    sendError(res, e, "remove this channel's setup")
  }
})
