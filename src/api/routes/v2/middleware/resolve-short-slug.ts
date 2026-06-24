import { Request, Response, NextFunction } from "express"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { parseShortSlug, buildUuidRangeQuery } from "../util/short-slug.js"

const SLUG_PARAM_TABLES: Record<string, { table: string; column: string }> = {
  "/api/v2/listings/": { table: "listings", column: "listing_id" },
  "/api/v2/game-items/": { table: "game_items", column: "id" },
  "/api/v2/wiki/items/": { table: "game_items", column: "id" },
  "/api/v2/wiki/ships/": { table: "game_items", column: "id" },
}

export async function resolveShortSlug(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const path = req.path
  const match = Object.entries(SLUG_PARAM_TABLES).find(([prefix]) =>
    path.startsWith(prefix),
  )
  if (!match) return next()

  const [prefix, { table, column }] = match
  const idSegment = path.slice(prefix.length).split("/")[0]
  if (!idSegment) return next()

  const { prefix: hexPrefix, isFullUuid } = parseShortSlug(idSegment)
  if (isFullUuid) return next()

  try {
    const knex = getKnex()
    const range = buildUuidRangeQuery(hexPrefix, column)
    const row = await knex(table)
      .whereRaw(range.sql, range.bindings)
      .select(column)
      .first()

    if (row) {
      const resolvedId = row[column]
      req.url = req.url.replace(idSegment, resolvedId)
      if (req.params.id) req.params.id = resolvedId
    }
  } catch {
    // If resolution fails, let the controller handle it (will 404)
  }

  next()
}
