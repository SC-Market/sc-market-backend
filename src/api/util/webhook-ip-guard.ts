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
 */

import dns from "node:dns"
import net from "node:net"

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

/**
 * Resolves `hostname` and throws a WebhookDestinationError unless it resolves
 * to at least one address and every address is public.
 */
export async function assertPublicDestination(
  hostname: string,
  lookup: Lookup = dns.promises.lookup as unknown as Lookup,
): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) {
    if (!isPublicAddress(host))
      throw new WebhookDestinationError(
        `Webhook destination ${host} is not public`,
      )
    return
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
}
