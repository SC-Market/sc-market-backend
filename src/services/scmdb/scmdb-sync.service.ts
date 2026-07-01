import crypto from "crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export interface ScmdbTokenStatus {
  is_active: boolean
  ingest_url: string | null
  last_event_at: string | null
  created_at: string | null
}

export interface ScmdbProcessResult {
  status: "processed" | "duplicate" | "token_inactive" | "token_not_found" | "unsupported_schema" | "unknown_event"
  matched?: number
  unmatched?: number
}

interface ScmdbEnvelope {
  schema: number
  event_id: string
  event: string
  user: { id: string; handle: string | null }
  ts: number
  payload: Record<string, unknown>
}

function buildIngestUrl(token: string): string {
  const base = process.env.PUBLIC_URL || "https://sc-market.space"
  return `${base}/api/v2/integrations/scmdb/ingest/${token}`
}

export class ScmdbSyncService {
  async generateToken(userId: string): Promise<{ token: string; ingest_url: string }> {
    const knex = getKnex()
    const token = crypto.randomBytes(32).toString("hex")

    await knex("scmdb_sync_tokens").insert({
      user_id: userId,
      token,
      is_active: true,
    })

    return { token, ingest_url: buildIngestUrl(token) }
  }

  async getTokenStatus(userId: string): Promise<ScmdbTokenStatus | null> {
    const knex = getKnex()
    const row = await knex("scmdb_sync_tokens")
      .where("user_id", userId)
      .where("is_active", true)
      .first()

    if (!row) return null

    return {
      is_active: true,
      ingest_url: buildIngestUrl(row.token),
      last_event_at: row.last_event_at?.toISOString() || null,
      created_at: row.created_at?.toISOString() || null,
    }
  }

  async regenerateToken(userId: string): Promise<{ token: string; ingest_url: string }> {
    const knex = getKnex()

    await knex("scmdb_sync_tokens")
      .where("user_id", userId)
      .where("is_active", true)
      .update({ is_active: false })

    return this.generateToken(userId)
  }

  async deactivateToken(userId: string): Promise<void> {
    const knex = getKnex()
    await knex("scmdb_sync_tokens")
      .where("user_id", userId)
      .where("is_active", true)
      .update({ is_active: false })
  }

  async processEvent(token: string, body: string): Promise<ScmdbProcessResult> {
    const knex = getKnex()

    const tokenRow = await knex("scmdb_sync_tokens")
      .where("token", token)
      .first()

    if (!tokenRow) return { status: "token_not_found" }
    if (!tokenRow.is_active) return { status: "token_inactive" }

    const userId: string = tokenRow.user_id

    let envelope: ScmdbEnvelope
    try {
      envelope = JSON.parse(body)
    } catch {
      logger.warn("SCMDB: invalid JSON body", { userId })
      return { status: "processed" }
    }

    if (envelope.schema !== 1) {
      logger.warn("SCMDB: unsupported schema version", { schema: envelope.schema, userId })
      return { status: "unsupported_schema" }
    }

    const existing = await knex("scmdb_events")
      .where("event_id", envelope.event_id)
      .first()
    if (existing) return { status: "duplicate" }

    await knex("scmdb_events").insert({
      event_id: envelope.event_id,
      user_id: userId,
      event_type: envelope.event,
    })

    await knex("scmdb_sync_tokens")
      .where("id", tokenRow.id)
      .update({ last_event_at: new Date() })

    let result: ScmdbProcessResult

    switch (envelope.event) {
      case "blueprint.snapshot":
        result = await this.handleSnapshot(userId, envelope.payload)
        break
      case "blueprint.owned.added":
        result = await this.handleBlueprintAdded(userId, envelope.payload)
        break
      case "blueprint.owned.removed":
        result = await this.handleBlueprintRemoved(userId, envelope.payload)
        break
      default:
        logger.info("SCMDB: ignoring unknown event", { event: envelope.event, userId })
        result = { status: "unknown_event" }
    }

    return result
  }

  private async handleSnapshot(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<ScmdbProcessResult> {
    const knex = getKnex()
    const owned = (payload.owned as Array<{ tag: string; product_name: string }>) || []

    logger.info("SCMDB: processing snapshot", { userId, count: owned.length })

    const tags = owned.map((o) => o.tag)
    const { matched, unmatched } = await this.resolveTags(tags)

    await knex.transaction(async (trx) => {
      await trx("user_blueprint_inventory")
        .where("user_id", userId)
        .update({ is_owned: false, updated_at: new Date() })

      for (const { blueprintId, blueprintName } of matched) {
        const existing = await trx("user_blueprint_inventory")
          .where("user_id", userId)
          .where("blueprint_name", blueprintName)
          .first()

        if (existing) {
          await trx("user_blueprint_inventory")
            .where("inventory_id", existing.inventory_id)
            .update({
              is_owned: true,
              blueprint_id: blueprintId,
              acquisition_method: "scmdb_snapshot",
              updated_at: new Date(),
            })
        } else {
          await trx("user_blueprint_inventory").insert({
            user_id: userId,
            blueprint_id: blueprintId,
            blueprint_name: blueprintName,
            is_owned: true,
            acquisition_date: new Date(),
            acquisition_method: "scmdb_snapshot",
          })
        }
      }
    })

    await this.trackUnmatchedTags(unmatched)

    return { status: "processed", matched: matched.length, unmatched: unmatched.length }
  }

  private async handleBlueprintAdded(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<ScmdbProcessResult> {
    const knex = getKnex()
    const tag = payload.tag as string
    const source = (payload.source as string) || "unknown"

    if (!tag) return { status: "processed", matched: 0, unmatched: 0 }

    const { matched, unmatched } = await this.resolveTags([tag])

    if (matched.length > 0) {
      const { blueprintId, blueprintName } = matched[0]
      const existing = await knex("user_blueprint_inventory")
        .where("user_id", userId)
        .where("blueprint_name", blueprintName)
        .first()

      if (existing) {
        await knex("user_blueprint_inventory")
          .where("inventory_id", existing.inventory_id)
          .update({
            is_owned: true,
            blueprint_id: blueprintId,
            acquisition_method: `scmdb_${source}`,
            acquisition_date: new Date(),
            updated_at: new Date(),
          })
      } else {
        await knex("user_blueprint_inventory").insert({
          user_id: userId,
          blueprint_id: blueprintId,
          blueprint_name: blueprintName,
          is_owned: true,
          acquisition_date: new Date(),
          acquisition_method: `scmdb_${source}`,
        })
      }
    }

    await this.trackUnmatchedTags(unmatched)

    return { status: "processed", matched: matched.length, unmatched: unmatched.length }
  }

  private async handleBlueprintRemoved(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<ScmdbProcessResult> {
    const knex = getKnex()
    const tag = payload.tag as string

    if (!tag) return { status: "processed", matched: 0, unmatched: 0 }

    const { matched, unmatched } = await this.resolveTags([tag])

    if (matched.length > 0) {
      const { blueprintName } = matched[0]
      await knex("user_blueprint_inventory")
        .where("user_id", userId)
        .where("blueprint_name", blueprintName)
        .update({ is_owned: false, updated_at: new Date() })
    }

    await this.trackUnmatchedTags(unmatched)

    return { status: "processed", matched: matched.length, unmatched: unmatched.length }
  }

  private async resolveTags(tags: string[]): Promise<{
    matched: Array<{ tag: string; blueprintId: string; blueprintName: string }>
    unmatched: string[]
  }> {
    const knex = getKnex()
    const matched: Array<{ tag: string; blueprintId: string; blueprintName: string }> = []
    const unmatched: string[] = []

    if (tags.length === 0) return { matched, unmatched }

    const activeVersion = await knex("game_versions")
      .where("version_type", "LIVE")
      .where("is_active", true)
      .orderBy("created_at", "desc")
      .first()

    if (!activeVersion) {
      logger.warn("SCMDB: no active LIVE version found")
      return { matched: [], unmatched: tags }
    }

    const blueprints = await knex("blueprints")
      .where("version_id", activeVersion.version_id)
      .where("is_active", true)
      .select("blueprint_id", "blueprint_name")

    const bpByName = new Map<string, { blueprint_id: string; blueprint_name: string }>()
    for (const bp of blueprints) {
      bpByName.set(bp.blueprint_name.toLowerCase(), bp)
    }

    for (const tag of tags) {
      const bp = bpByName.get(tag.toLowerCase())
      if (bp) {
        matched.push({ tag, blueprintId: bp.blueprint_id, blueprintName: bp.blueprint_name })
      } else {
        unmatched.push(tag)
      }
    }

    return { matched, unmatched }
  }

  private async trackUnmatchedTags(tags: string[]): Promise<void> {
    if (tags.length === 0) return
    const knex = getKnex()

    for (const tag of tags) {
      await knex.raw(
        `INSERT INTO scmdb_unmatched_tags (tag, first_seen_at, last_seen_at, occurrence_count)
         VALUES (?, NOW(), NOW(), 1)
         ON CONFLICT (tag) DO UPDATE SET
           last_seen_at = NOW(),
           occurrence_count = scmdb_unmatched_tags.occurrence_count + 1`,
        [tag],
      )
    }
  }
}

export const scmdbSyncService = new ScmdbSyncService()
