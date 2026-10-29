import { describe, expect, it } from "vitest"
import { renderEmailMarkdown, renderEmailPlainText } from "./email-markdown.js"

const html = (md: string) => renderEmailMarkdown(md).html
const text = (md: string) => renderEmailMarkdown(md).text

describe("renderEmailMarkdown", () => {
  it("maps headings to h1-h4 with inline sizes; h5/h6 become h4", () => {
    const out = html("# One\n\n## Two\n\n### Three\n\n###### Six")
    expect(out).toMatch(/<h1 style="[^"]*font-size:22px[^"]*">One<\/h1>/)
    expect(out).toMatch(/<h2 style="[^"]*font-size:19px[^"]*">Two<\/h2>/)
    expect(out).toMatch(/<h3 style="[^"]*">Three<\/h3>/)
    expect(out).toMatch(/<h4 style="[^"]*">Six<\/h4>/)
    expect(out).not.toMatch(/>#/)
  })

  it("renders bullet and numbered lists", () => {
    const out = html("- alpha\n- beta\n\n3. three\n4. four")
    expect(out).toMatch(
      /<ul style="[^"]*"><li style="[^"]*">alpha<\/li><li style="[^"]*">beta<\/li><\/ul>/,
    )
    expect(out).toMatch(
      /<ol start="3" style="[^"]*"><li[^>]*>three<\/li><li[^>]*>four<\/li><\/ol>/,
    )
  })

  it("renders bold, italic, strikethrough and inline code", () => {
    const out = html("**bold** *it* _also_ ~~gone~~ `a < b`")
    expect(out).toContain("<strong>bold</strong>")
    expect(out).toContain("<em>it</em>")
    expect(out).toContain("<em>also</em>")
    expect(out).toContain("<s>gone</s>")
    expect(out).toMatch(/<code style="[^"]*">a &lt; b<\/code>/)
    expect(out).not.toContain("**")
  })

  it("renders fenced code blocks, quotes and rules", () => {
    const out = html("```\nconst x = '<y>'\n```\n\n> quoted\n\n---")
    expect(out).toMatch(
      /<pre style="[^"]*"><code>const x = '&lt;y&gt;'<\/code><\/pre>/,
    )
    expect(out).toMatch(
      /<blockquote style="[^"]*border-left:3px solid #10b881[^"]*"><p[^>]*>quoted<\/p><\/blockquote>/,
    )
    expect(out).toMatch(/<hr style="[^"]*" \/>/)
  })

  it("renders http(s) links with rel=noopener and autolinks bare URLs", () => {
    const out = html(
      "[RSI](https://robertsspaceindustries.com) and https://sc-market.space/market",
    )
    expect(out).toContain(
      '<a href="https://robertsspaceindustries.com/" target="_blank" rel="noopener noreferrer" style="color:#7a7efe;text-decoration:underline">RSI</a>',
    )
    expect(out).toContain('href="https://sc-market.space/market"')
  })

  it("drops javascript:, data: and relative links but keeps their text", () => {
    const out = html(
      "[x](javascript:alert(1)) [y](data:text/html,hi) [z](/relative) <javascript:alert(2)>",
    )
    expect(out).not.toMatch(/href=/)
    expect(out).not.toMatch(/javascript:alert\(1\)/)
    expect(out).toContain("x")
    expect(out).toContain("y")
    expect(out).toContain("z")
  })

  it("strips <script> and escapes other raw HTML instead of passing it through", () => {
    const out = html(
      'hi <script>alert(1)</script>\n\n<div onclick="x()">block</div>\n\n<img src=x onerror=alert(1)>',
    )
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/<div/i)
    expect(out).not.toMatch(/<img/i)
    expect(out).toContain("&lt;script&gt;")
    expect(out).toContain("&lt;div onclick=")
  })

  it("never embeds images; they become a link", () => {
    const out = html("![ship](https://i.imgur.com/a.png)")
    expect(out).not.toMatch(/<img/i)
    expect(out).toContain('href="https://i.imgur.com/a.png"')
    expect(out).toContain("[Image: ship]")
  })

  it("keeps the editor toolbar tags (no attributes) and balances them", () => {
    const out = html("<u>under</u> <sub>low</sub> <s>struck</s> <u>open")
    expect(out).toContain("<u>under</u>")
    expect(out).toContain("<sub>low</sub>")
    expect(out).toContain("<s>struck</s>")
    expect(out).toMatch(/<u>open<\/u>/)
    expect(html('<u style="x">a</u>')).toContain("&lt;u style=")
  })

  it("does not double-escape text", () => {
    const out = html('Tom & Jerry\'s "ship"')
    expect(out).not.toContain("&amp;amp;")
    expect(out).toContain("Tom &amp; Jerry")
  })

  it("produces a stripped plain-text version", () => {
    const md =
      "# Welcome\n\nWe fly **cargo** and *mining*.\n\n- Hauling\n- [Discord](https://discord.gg/abc)\n\n> Be nice\n\n<script>x</script>"
    expect(text(md)).toBe(
      "Welcome\n\nWe fly cargo and mining.\n\n- Hauling\n- Discord (https://discord.gg/abc)\n\n> Be nice\n\n<script>x</script>",
    )
  })

  it("truncates long bodies at a block boundary with a read-more link", () => {
    const md = Array.from(
      { length: 40 },
      (_, i) => `Paragraph ${i} ${"word ".repeat(15)}`,
    ).join("\n\n")
    const out = renderEmailMarkdown(md, {
      maxChars: 300,
      readMoreUrl: "https://sc-market.space/contractor/ABC",
    })
    expect(out.truncated).toBe(true)
    expect(out.html).toContain("Paragraph 0")
    expect(out.html).not.toContain("Paragraph 39")
    expect(out.html).toContain('href="https://sc-market.space/contractor/ABC"')
    expect(out.html).toContain("Read the full text on SC Market")
    expect(out.text).toContain(
      "Read the full text on SC Market: https://sc-market.space/contractor/ABC",
    )
  })

  it("cuts a single oversized block at a word", () => {
    const out = renderEmailMarkdown(
      "**" + "longword ".repeat(100).trim() + "**",
      {
        maxChars: 50,
      },
    )
    expect(out.truncated).toBe(true)
    expect(out.text.length).toBeLessThan(70)
    expect(out.text).not.toContain("**")
  })

  it("returns empty output for empty input", () => {
    expect(renderEmailMarkdown(null)).toEqual({
      html: "",
      text: "",
      truncated: false,
    })
    expect(renderEmailMarkdown("   ")).toEqual({
      html: "",
      text: "",
      truncated: false,
    })
  })
})

describe("renderEmailPlainText", () => {
  it("escapes everything and keeps line breaks", () => {
    const out = renderEmailPlainText("Hi **there**\nline two\n\n<b>para</b>")
    expect(out.html).toContain("Hi **there**<br />line two")
    expect(out.html).toContain("&lt;b&gt;para&lt;/b&gt;")
    expect(out.text).toBe("Hi **there**\nline two\n\n<b>para</b>")
  })
})
