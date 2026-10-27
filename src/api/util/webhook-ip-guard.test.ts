import { describe, expect, it, vi } from "vitest"
import {
  WebhookDestinationError,
  assertPublicDestination,
  isPublicAddress,
} from "./webhook-ip-guard.js"

describe("isPublicAddress", () => {
  it.each([
    "162.159.135.232", // discord.com
    "1.1.1.1",
    "8.8.8.8",
    "2606:4700::6810:84e5",
    "::ffff:162.159.135.232",
  ])("allows public %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true)
  })

  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "169.254.0.1",
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::",
    "::1",
    "fe80::1",
    "fd00:ec2::254", // AWS metadata over IPv6
    "fc00::1",
    "ff02::1",
    "::ffff:127.0.0.1", // IPv4-mapped
    "::ffff:7f00:1", // IPv4-mapped, hex form
    "::ffff:a9fe:a9fe", // 169.254.169.254, hex form
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
    "2002:0a00:0001::1", // 6to4 of 10.0.0.1
    "not-an-ip",
    "",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })
})

describe("assertPublicDestination", () => {
  const lookupTo = (...addresses: string[]) =>
    vi.fn(async () =>
      addresses.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      })),
    )

  it("passes when every address is public", async () => {
    await expect(
      assertPublicDestination(
        "discord.com",
        lookupTo("162.159.135.232", "2606:4700::6810:84e5"),
      ),
    ).resolves.toBeUndefined()
  })

  it("refuses when any resolved address is private (DNS rebinding / poisoned record)", async () => {
    await expect(
      assertPublicDestination(
        "discord.com",
        lookupTo("162.159.135.232", "169.254.169.254"),
      ),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    await expect(
      assertPublicDestination("discord.com", lookupTo("127.0.0.1")),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
  })

  it("refuses an unresolvable host or an empty answer", async () => {
    await expect(
      assertPublicDestination("discord.com", lookupTo()),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    const failing = vi.fn(async () => {
      throw new Error("ENOTFOUND")
    })
    await expect(
      assertPublicDestination("discord.com", failing),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
  })

  it("checks IP literals without DNS", async () => {
    const lookup = lookupTo("1.1.1.1")
    await expect(
      assertPublicDestination("[::1]", lookup),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    await expect(
      assertPublicDestination("10.0.0.1", lookup),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    expect(lookup).not.toHaveBeenCalled()
  })
})
