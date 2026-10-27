/**
 * Send-time SSRF guard for outbound webhooks: the destination host must
 * resolve only to public unicast addresses.
 *
 * validateWebhookUrl (validate-webhook-url.ts) is the primary defense: it
 * allows only exact Discord webhook hosts, so a user can't name an internal
 * host or an IP literal. This is the second layer, for the day an allowlisted
 * name resolves somewhere it shouldn't (a hijacked record, a poisoned local
 * resolver, a future allowlist entry that isn't as tightly controlled): before
 * each send, every address the host resolves to must be public. Private,
 * loopback, link-local (including the 169.254.169.254 cloud metadata
 * endpoint), CGNAT, multicast, reserved and documentation ranges are refused,
 * for IPv4, IPv6, and IPv4 embedded in IPv6.
 *
 * The connection is pinned to the addresses that were checked
 * (fetchPublicDestination): the HTTP client gets a lookup that answers only
 * with them, so a second resolution can't hand it a different (private)
 * address between the check and the connect (DNS rebinding). The URL is
 * unchanged, so the Host header and TLS SNI/certificate checks still use the
 * hostname.
 */

import dns from "node:dns"
import net from "node:net"
import { Agent, fetch, type RequestInit, type Response } from "undici"

const BLOCKED = new net.BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local, incl. fd00:ec2::254 (AWS metadata over IPv6)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6")
}

/** IPv6 forms that embed an IPv4 address: IPv4-mapped, IPv4-compatible, NAT64, 6to4. */
function embeddedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase()
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (dotted) return dotted[1]
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
    lower,
  )
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/.exec(lower)
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16)
    const lo = parseInt(sixToFour[2], 16)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return null
}

/** Whether `ip` is a public unicast address a webhook may be sent to. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return !BLOCKED.check(ip, "ipv4")
  if (family === 6) {
    const v4 = embeddedIpv4(ip)
    if (v4 !== null) return net.isIPv4(v4) && !BLOCKED.check(v4, "ipv4")
    return !BLOCKED.check(ip, "ipv6")
  }
  return false
}

export class WebhookDestinationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookDestinationError"
  }
}

type Lookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

/**
 * Resolves `hostname` and returns its addresses, or throws a
 * WebhookDestinationError unless it resolves to at least one address and
 * every address is public. An IP literal is checked without DNS.
 */
export async function resolvePublicDestination(
  hostname: string,
  lookup: Lookup = dns.promises.lookup as unknown as Lookup,
): Promise<ResolvedAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "")
  const literal = net.isIP(host)
  if (literal) {
    if (!isPublicAddress(host))
      throw new WebhookDestinationError(
        `Webhook destination ${host} is not public`,
      )
    return [{ address: host, family: literal as 4 | 6 }]
  }
  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch (e) {
    throw new WebhookDestinationError(
      `Webhook host ${host} did not resolve: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (addresses.length === 0)
    throw new WebhookDestinationError(`Webhook host ${host} did not resolve`)
  const blocked = addresses.filter((a) => !isPublicAddress(a.address))
  if (blocked.length) {
    throw new WebhookDestinationError(
      `Webhook host ${host} resolves to a non-public address (${blocked.map((a) => a.address).join(", ")})`,
    )
  }
  return addresses.map((a) => ({
    address: a.address,
    family: net.isIP(a.address) as 4 | 6,
  }))
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void

/**
 * A `net.connect` / `tls.connect` lookup that answers `hostname` with the
 * given (already validated) addresses only, and never asks DNS. Any other
 * hostname is an error. Honors `family` and `all` (Node's happy-eyeballs
 * connect asks with `all: true`).
 */
export function pinnedLookup(hostname: string, addresses: ResolvedAddress[]) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    name: string,
    options: { family?: number | string; all?: boolean } | number | LookupCallback,
    callback?: LookupCallback,
  ): void => {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback
    const opts = typeof options === "object" && options !== null ? options : {}
    const wanted =
      typeof options === "number"
        ? options
        : opts.family === "IPv4"
          ? 4
          : opts.family === "IPv6"
            ? 6
            : Number(opts.family) || 0
    const answer = addresses.filter((a) => !wanted || a.family === wanted)
    if (name.replace(/^\[|\]$/g, "").toLowerCase() !== host || answer.length === 0) {
      const err: NodeJS.ErrnoException = new Error(
        `Webhook connection to ${name} is not pinned to a validated address`,
      )
      err.code = "ENOTFOUND"
      process.nextTick(() => cb(err, opts.all ? [] : "", 0))
      return
    }
    process.nextTick(() =>
      opts.all ? cb(null, answer) : cb(null, answer[0].address, answer[0].family),
    )
  }
}

/** An undici dispatcher whose connections to `hostname` go only to `addresses`. */
export function pinnedAgent(hostname: string, addresses: ResolvedAddress[]): Agent {
  return new Agent({
    connect: { lookup: pinnedLookup(hostname, addresses) },
    // One request per agent: no keep-alive pool to outlive the send.
    pipelining: 0,
  })
}

/**
 * fetch() to a webhook URL whose host must resolve only to public addresses,
 * with the connection pinned to the addresses that were checked. Throws a
 * WebhookDestinationError (before connecting) otherwise. The response body is
 * readable until `release()` is called; call it when done (it closes the
 * pinned connection).
 */
export async function fetchPublicDestination(
  url: string,
  init: Omit<RequestInit, "dispatcher">,
  lookup?: Lookup,
): Promise<{ response: Response; release: () => Promise<void> }> {
  const { hostname } = new URL(url)
  const addresses = await resolvePublicDestination(hostname, lookup)
  const dispatcher = pinnedAgent(hostname, addresses)
  const release = () => dispatcher.destroy().catch(() => undefined)
  try {
    const response = await fetch(url, { ...init, dispatcher })
    return { response, release }
  } catch (e) {
    await release()
    throw e
  }
}
