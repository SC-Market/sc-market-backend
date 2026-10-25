import type { IncomingMessage } from "node:http"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import ipaddr from "ipaddr.js"
import {
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
} from "../../config/cloudflare-ips.js"
import { createForbiddenErrorResponse } from "../routes/v1/util/response.js"

/**
 * Cloudflare-only origin guard.
 *
 * Traffic chain: Cloudflare (api.sc-market.space, proxied) -> Lightsail load
 * balancer -> this container. The Lightsail LB appends the IP of whatever
 * connected to it as the LAST X-Forwarded-For entry, so that entry is the one
 * value a client cannot forge. Through Cloudflare it is a Cloudflare edge IP;
 * through the *.cs.amazonlightsail.com URL (or the LB IPs directly) it is the
 * caller's own IP, and the earlier entries are whatever the caller sent.
 *
 * - XFF present, last hop in Cloudflare's ranges: allow.
 * - XFF present, last hop anything else (or unparseable): reject.
 * - No XFF at all: the request did not come through the LB (container-local
 *   or service-network traffic), allow.
 */

const V4 = CLOUDFLARE_IPV4_RANGES.map((cidr) => ipaddr.IPv4.parseCIDR(cidr))
const V6 = CLOUDFLARE_IPV6_RANGES.map((cidr) => ipaddr.IPv6.parseCIDR(cidr))

export function isCloudflareIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false
  // process() turns IPv4-mapped IPv6 (::ffff:a.b.c.d) into plain IPv4.
  const addr = ipaddr.process(ip)
  if (addr.kind() === "ipv4") {
    const v4 = addr as ipaddr.IPv4
    return V4.some((range) => v4.match(range))
  }
  const v6 = addr as ipaddr.IPv6
  return V6.some((range) => v6.match(range))
}

/** True when the request may proceed: no XFF, or its rightmost entry is Cloudflare. */
export function isAllowedOriginHop(
  xff: string | string[] | undefined,
): boolean {
  if (xff === undefined) return true
  const joined = Array.isArray(xff) ? xff.join(",") : xff
  const entries = joined.split(",")
  return isCloudflareIp(entries[entries.length - 1].trim())
}

export function isRequestFromCloudflare(req: IncomingMessage): boolean {
  return isAllowedOriginHop(req.headers["x-forwarded-for"])
}

/**
 * ENFORCE_CLOUDFLARE_ORIGIN must be "true" or "false" when set; unset means
 * on in production, off elsewhere (local dev and tests have no Cloudflare).
 */
export function shouldEnforceCloudflareOrigin(env: {
  NODE_ENV?: string
  ENFORCE_CLOUDFLARE_ORIGIN?: string
}): boolean {
  const raw = env.ENFORCE_CLOUDFLARE_ORIGIN
  if (raw === undefined || raw === "") return env.NODE_ENV === "production"
  if (raw === "true") return true
  if (raw === "false") return false
  throw new Error(
    `ENFORCE_CLOUDFLARE_ORIGIN must be "true" or "false", got "${raw}"`,
  )
}

export interface CloudflareOnlyOptions {
  enforce: boolean
  /** Paths always allowed (the Lightsail health check path). */
  exemptPaths?: readonly string[]
}

export function cloudflareOnly(options: CloudflareOnlyOptions): RequestHandler {
  const exempt = new Set(options.exemptPaths ?? [])
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      !options.enforce ||
      exempt.has(req.path) ||
      isRequestFromCloudflare(req)
    ) {
      next()
      return
    }
    res
      .status(403)
      .json(createForbiddenErrorResponse("Direct origin access is not allowed"))
  }
}
