import http from "node:http"
import net from "node:net"
import tls from "node:tls"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { fetch } from "undici"
import {
  WebhookDestinationError,
  fetchPublicDestination,
  isPublicAddress,
  pinnedAgent,
  pinnedLookup,
  resolvePublicDestination,
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

const lookupTo = (...addresses: string[]) =>
  vi.fn(async () =>
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    })),
  )

describe("resolvePublicDestination", () => {
  it("returns the addresses when every one is public", async () => {
    await expect(
      resolvePublicDestination(
        "discord.com",
        lookupTo("162.159.135.232", "2606:4700::6810:84e5"),
      ),
    ).resolves.toEqual([
      { address: "162.159.135.232", family: 4 },
      { address: "2606:4700::6810:84e5", family: 6 },
    ])
  })

  it("refuses when any resolved address is private (DNS rebinding / poisoned record)", async () => {
    await expect(
      resolvePublicDestination(
        "discord.com",
        lookupTo("162.159.135.232", "169.254.169.254"),
      ),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    await expect(
      resolvePublicDestination("discord.com", lookupTo("127.0.0.1")),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
  })

  it("refuses an unresolvable host or an empty answer", async () => {
    await expect(
      resolvePublicDestination("discord.com", lookupTo()),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    const failing = vi.fn(async () => {
      throw new Error("ENOTFOUND")
    })
    await expect(
      resolvePublicDestination("discord.com", failing),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
  })

  it("checks IP literals without DNS", async () => {
    const lookup = lookupTo("1.1.1.1")
    await expect(
      resolvePublicDestination("[::1]", lookup),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    await expect(
      resolvePublicDestination("10.0.0.1", lookup),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    await expect(resolvePublicDestination("1.1.1.1", lookup)).resolves.toEqual([
      { address: "1.1.1.1", family: 4 },
    ])
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe("pinnedLookup", () => {
  const pinned = pinnedLookup("Discord.com", [
    { address: "162.159.135.232", family: 4 },
    { address: "2606:4700::6810:84e5", family: 6 },
  ])
  const ask = (name: string, options: object) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>(
      (resolve) => pinned(name, options, (err, address, family) => resolve({ err, address, family })),
    )

  it("answers only with the pinned addresses", async () => {
    expect(await ask("discord.com", { all: true })).toMatchObject({
      err: null,
      address: [
        { address: "162.159.135.232", family: 4 },
        { address: "2606:4700::6810:84e5", family: 6 },
      ],
    })
    expect(await ask("discord.com", {})).toMatchObject({
      err: null,
      address: "162.159.135.232",
      family: 4,
    })
    expect(await ask("discord.com", { family: 6 })).toMatchObject({
      address: "2606:4700::6810:84e5",
      family: 6,
    })
  })

  it("refuses any other hostname", async () => {
    const { err } = await ask("evil.example", { all: true })
    expect(err?.code).toBe("ENOTFOUND")
  })
})

describe("pinned connections (real sockets)", () => {
  // The hostname never resolves (.invalid), so reaching the server at all
  // proves the connection used the pinned address and not the resolver.
  const HOST = "rebind.invalid"
  let server: http.Server
  let port: number
  const seen: Array<{ host?: string; url?: string; method?: string }> = []

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url, method: req.method })
      req.resume()
      res.writeHead(204).end()
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  afterEach(() => {
    seen.length = 0
    vi.restoreAllMocks()
  })

  it("connects to the pinned address and keeps the Host header", async () => {
    const dispatcher = pinnedAgent(HOST, [{ address: "127.0.0.1", family: 4 }])
    try {
      const res = await fetch(`http://${HOST}:${port}/api/webhooks/1/x`, {
        method: "POST",
        body: "{}",
        dispatcher,
      })
      expect(res.status).toBe(204)
    } finally {
      await dispatcher.destroy()
    }
    expect(seen).toEqual([
      { host: `${HOST}:${port}`, url: "/api/webhooks/1/x", method: "POST" },
    ])
  })

  it("keeps the hostname as TLS SNI", async () => {
    const servernames: string[] = []
    const tlsServer = tls.createServer({
      SNICallback: (name, cb) => {
        servernames.push(name)
        cb(new Error("no certificate in this test"))
      },
    })
    await new Promise<void>((r) => tlsServer.listen(0, "127.0.0.1", r))
    const tlsPort = (tlsServer.address() as AddressInfo).port
    const dispatcher = pinnedAgent(HOST, [{ address: "127.0.0.1", family: 4 }])
    try {
      await expect(fetch(`https://${HOST}:${tlsPort}/`, { dispatcher })).rejects.toThrow()
    } finally {
      await dispatcher.destroy()
      await new Promise<void>((r) => tlsServer.close(() => r()))
    }
    expect(servernames).toEqual([HOST])
  })

  it("DNS rebinding: resolves once, then connects only to the checked address", async () => {
    // First answer is public, every later one private: a client that resolved
    // again at connect time would go to 127.0.0.1.
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
    // Intercept the socket: record what the pinned lookup answers for the
    // connection, then carry the bytes to the local server (8.8.8.8 isn't
    // reachable from a test).
    const realConnect = net.connect.bind(net)
    const connectedTo: unknown[] = []
    vi.spyOn(net, "connect").mockImplementation(((opts: { host: string; lookup: ReturnType<typeof pinnedLookup> }) => {
      opts.lookup(opts.host, { all: true }, (_err, address) => connectedTo.push(address))
      return realConnect({ host: "127.0.0.1", port })
    }) as never)

    const { response, release } = await fetchPublicDestination(
      `http://${HOST}:${port}/api/webhooks/1/x`,
      { method: "POST", body: "{}" },
      lookup,
    )
    expect(response.status).toBe(204)
    await release()

    expect(lookup).toHaveBeenCalledTimes(1)
    expect(connectedTo).toEqual([[{ address: "8.8.8.8", family: 4 }]])
    expect(seen).toEqual([
      { host: `${HOST}:${port}`, url: "/api/webhooks/1/x", method: "POST" },
    ])
  })

  it("private IP: refuses before opening any connection", async () => {
    const connect = vi.spyOn(net, "connect")
    for (const address of ["127.0.0.1", "10.0.0.7", "169.254.169.254", "::ffff:7f00:1"]) {
      await expect(
        fetchPublicDestination(
          `http://${HOST}:${port}/`,
          { method: "POST" },
          lookupTo(address),
        ),
      ).rejects.toBeInstanceOf(WebhookDestinationError)
    }
    await expect(
      fetchPublicDestination(`http://127.0.0.1:${port}/`, { method: "POST" }),
    ).rejects.toBeInstanceOf(WebhookDestinationError)
    expect(connect).not.toHaveBeenCalled()
    expect(seen).toEqual([])
  })
})
