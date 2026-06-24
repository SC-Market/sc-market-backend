import { Request, Response, NextFunction } from "express"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { parseShortSlug, buildUuidRangeQuery } from "../util/short-slug.js"

const SLUG_PATH_TABLES: Record<string, { table: string; column: string }> = {
  "/listings/": { table: "listings", column: "listing_id" },
  "/game-items/": { table: "game_items", column: "id" },
  "/game-data/wiki/items/": { table: "game_items", column: "id" },
  "/game-data/wiki/ships/": { table: "game_items", column: "id" },
}

const SLUG_QUERY_PARAMS: Record<string, { table: string; column: string }> = {
  game_item_id: { table: "game_items", column: "id" },
  listing_id: { table: "listings", column: "listing_id" },
}

async function resolveToUuid(
  hexPrefix: string,
  table: string,
  column: string,
): Promise<string | null> {
  try {
    const knex = getKnex()
    const range = buildUuidRangeQuery(hexPrefix, column)
    const row = await knex(table)
      .whereRaw(range.sql, range.bindings)
      .select(column)
      .first()
    return row ? row[column] : null
  } catch {
    return null
  }
}

export async function resolveShortSlug(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Resolve path params
  const path = req.path
  const pathMatch = Object.entries(SLUG_PATH_TABLES).find(([prefix]) =>
    path.startsWith(prefix),
  )

  if (pathMatch) {
    const [prefix, { table, column }] = pathMatch
    const idSegment = path.slice(prefix.length).split("/")[0]
    if (idSegment) {
      const { prefix: hexPrefix, isFullUuid } = parseShortSlug(idSegment)
      if (!isFullUuid) {
        const resolved = await resolveToUuid(hexPrefix, table, column)
        if (resolved) {
          req.url = req.url.replace(idSegment, resolved)
          if (req.params.id) req.params.id = resolved
        }
      }
    }
  }

  // Resolve query params
  for (const [param, { table, column }] of Object.entries(SLUG_QUERY_PARAMS)) {
    const value = req.query[param]
    if (typeof value !== "string") continue
    const { prefix: hexPrefix, isFullUuid } = parseShortSlug(value)
    if (isFullUuid) continue
    const resolved = await resolveToUuid(hexPrefix, table, column)
    if (resolved) {
      ;(req.query as Record<string, string>)[param] = resolved
    }
  }

  next()
}
