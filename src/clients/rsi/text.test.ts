import { describe, it, expect } from "vitest"
import { decodeHtmlEntities, HTML_ENTITY_PATTERN, rsiHtmlToText } from "./text.js"

describe("decodeHtmlEntities", () => {
  it.each([
    ["It&rsquo;s", "It’s"],
    ["Rock &amp; Stone", "Rock & Stone"],
    ["Rock &#39;n&#39; Ore", "Rock 'n' Ore"],
    ["&quot;quoted&quot;", '"quoted"'],
    ["&lsquo;a&rsquo; &ldquo;b&rdquo;", "‘a’ “b”"],
    ["wait&hellip; &mdash; done", "wait… — done"],
    ["a&nbsp;b", "a b"],
    ["Latinoam&eacute;rica", "Latinoamérica"],
    ["Crash&#8217;s &#x1F680;", "Crash’s 🚀"],
  ])("%s", (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected)
  })

  it("leaves clean text, emoji and bare ampersands unchanged", () => {
    for (const clean of ["Crash’s Candy Shop 🍬", "AT&T", "R&D", "&bogus;", "ΛLPΛKΛ Collective", ""]) {
      expect(decodeHtmlEntities(clean)).toBe(clean)
    }
  })

  it("decodes once: double-encoded text keeps one level", () => {
    expect(decodeHtmlEntities("&amp;rsquo;")).toBe("&rsquo;")
    expect(decodeHtmlEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;")
  })
})

describe("rsiHtmlToText", () => {
  it("drops tags, then decodes and trims", () => {
    expect(rsiHtmlToText(" Rock &amp; <em>Stone</em> ")).toBe("Rock & Stone")
    expect(rsiHtmlToText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>")
  })
})

describe("HTML_ENTITY_PATTERN", () => {
  it("matches entity references, not bare ampersands", () => {
    expect(HTML_ENTITY_PATTERN.test("Crash&rsquo;s")).toBe(true)
    expect(HTML_ENTITY_PATTERN.test("&#39;")).toBe(true)
    expect(HTML_ENTITY_PATTERN.test("&#x1F680;")).toBe(true)
    expect(HTML_ENTITY_PATTERN.test("AT&T")).toBe(false)
    expect(HTML_ENTITY_PATTERN.test("Crash’s")).toBe(false)
  })
})
