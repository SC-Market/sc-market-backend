import type { Request } from "express"
import type { User } from "../../v1/api-models.js"

export const V2_DEBUG_OPENAPI_TAG = "Debug V2"

/**
 * Whether v2 debug / feature-flag internals should be exposed in OpenAPI and Scalar.
 * - Always in development
 * - In other environments, only for logged-in admins
 */
export function canViewV2DebugInternals(req: Request): boolean {
  if (process.env.NODE_ENV === "development") {
    return true
  }
  const user = req.user as User | undefined
  return user?.role === "admin"
}

type OpenApiLike = {
  paths?: Record<string, unknown>
  tags?: Array<{ name?: string }>
}

/**
 * Strip debug-only paths and tag entries from the v2 OpenAPI document.
 */
export function filterV2DebugFromOpenApiSpec<T extends OpenApiLike>(spec: T): T {
  const next = { ...spec }
  if (spec.paths) {
    const paths = { ...spec.paths }
    for (const pathKey of Object.keys(paths)) {
      if (pathKey.startsWith("/debug")) {
        delete paths[pathKey]
      }
    }
    next.paths = paths
  }
  if (Array.isArray(spec.tags)) {
    next.tags = spec.tags.filter((t) => t?.name !== V2_DEBUG_OPENAPI_TAG)
  }
  return next
}
