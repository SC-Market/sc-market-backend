/**
 * The v2 route table, read from the generated OpenAPI spec, for code that runs
 * before TSOA's own routing (router-level middleware). It answers, for a
 * method and router-relative path: which TSOA route is this, what are its path
 * params, and does it declare @Security?
 *
 * Express matches TSOA routes in declaration order, and the controllers
 * declare literal paths before their `{param}` siblings (see api-router.ts).
 * When several spec paths match, the one with the most literal segments is
 * the one Express runs, so that's the one returned.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export interface V2Route {
  method: string
  path: string
  regex: RegExp
  paramNames: string[]
  literalSegments: number
  /** The operation declares @Security (loggedin/verified). */
  secured: boolean
}

export interface V2RouteMatch {
  route: V2Route
  params: Record<string, string>
}

interface SpecOperation {
  security?: unknown[]
}

export function buildV2RouteTable(spec: {
  paths?: Record<string, Record<string, SpecOperation>>
}): V2Route[] {
  const routes: V2Route[] = []
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    const segments = path.replace(/^\/+/, "").split("/")
    const paramNames: string[] = []
    let literalSegments = 0
    const pattern = segments
      .map((seg) => {
        const m = /^\{([^}]+)\}$/.exec(seg)
        if (m) {
          paramNames.push(m[1])
          return "([^/]+)"
        }
        literalSegments++
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      })
      .join("/")
    const regex = new RegExp(`^/${pattern}/?$`, "i")
    for (const [method, op] of Object.entries(ops)) {
      routes.push({
        method: method.toUpperCase(),
        path,
        regex,
        paramNames,
        literalSegments,
        secured: Array.isArray(op?.security) && op.security.length > 0,
      })
    }
  }
  return routes
}

export function matchV2Route(
  table: V2Route[],
  method: string,
  path: string,
): V2RouteMatch | null {
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase()
  const clean = "/" + path.replace(/^\/+/, "").split("?")[0]
  let best: V2RouteMatch | null = null
  for (const route of table) {
    if (route.method !== m) continue
    const hit = route.regex.exec(clean)
    if (!hit) continue
    if (best && best.route.literalSegments >= route.literalSegments) continue
    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(hit[i + 1])
      } catch {
        params[name] = hit[i + 1]
      }
    })
    best = { route, params }
  }
  return best
}

let cached: V2Route[] | null = null

/** The table for the generated spec this server serves at /api/v2/openapi.json. */
export function v2RouteTable(): V2Route[] {
  if (!cached) {
    const here = dirname(fileURLToPath(import.meta.url))
    const spec = JSON.parse(
      readFileSync(join(here, "..", "generated", "swagger.json"), "utf-8"),
    )
    cached = buildV2RouteTable(spec)
  }
  return cached
}
