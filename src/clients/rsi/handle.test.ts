import { describe, it, expect } from "vitest"
import { parseRsiHandle } from "./handle.js"

describe("parseRsiHandle", () => {
  it.each([
    ["Khuzdul", "Khuzdul"],
    ["  Khuzdul  ", "Khuzdul"],
    ["@Khuzdul", "Khuzdul"],
    ["some_user-01", "some_user-01"],
    ["https://robertsspaceindustries.com/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/en/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/de/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/fr/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/es-ES/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/zh-CN/citizens/Khuzdul", "Khuzdul"],
    ["https://robertsspaceindustries.com/citizens/Khuzdul/", "Khuzdul"],
    ["https://robertsspaceindustries.com/en/citizens/Khuzdul/", "Khuzdul"],
    ["https://robertsspaceindustries.com/en/citizens/Khuzdul?utm_source=x", "Khuzdul"],
    ["https://robertsspaceindustries.com/citizens/Khuzdul?foo=1&bar=2#about", "Khuzdul"],
    ["https://robertsspaceindustries.com/en/citizens/Khuzdul/organizations", "Khuzdul"],
    ["https://www.robertsspaceindustries.com/en/citizens/Khuzdul", "Khuzdul"],
    ["http://robertsspaceindustries.com/citizens/Khuzdul", "Khuzdul"],
    ["robertsspaceindustries.com/en/citizens/Khuzdul", "Khuzdul"],
    ["www.robertsspaceindustries.com/citizens/Khuzdul/", "Khuzdul"],
    ["HTTPS://RobertsSpaceIndustries.com/EN/Citizens/Khuzdul", "Khuzdul"],
  ])("%s -> %s", (input, expected) => {
    expect(parseRsiHandle(input)).toBe(expected)
  })

  it.each([
    "",
    "   ",
    "not a handle",
    "https://example.com/citizens/Khuzdul",
    "https://robertsspaceindustries.com.evil.example/citizens/Khuzdul",
    "https://robertsspaceindustries.com/orgs/SCMARKET",
    "https://robertsspaceindustries.com/en/citizens/",
    "https://robertsspaceindustries.com/en/citizens",
    "https://robertsspaceindustries.com/",
    "https://robertsspaceindustries.com/en/spectrum/community/SC",
  ])("rejects %j", (input) => {
    expect(parseRsiHandle(input)).toBeNull()
  })

  it("rejects non-strings", () => {
    expect(parseRsiHandle(undefined)).toBeNull()
    expect(parseRsiHandle(42)).toBeNull()
  })
})
