/**
 * User- and org-authored text in emails.
 *
 * Descriptions, chat messages and admin alerts are Markdown on the site
 * (react-markdown + remark-gfm + rehype-sanitize, see the frontend's
 * components/markdown/Markdown.tsx). Emails used to drop the raw source into
 * `{{...}}`, so recipients saw `**bold**`, `# headings` and `- lists` as text.
 *
 * `renderEmailMarkdown` turns that source into email-safe HTML plus a
 * text/plain version:
 * - Safe by construction: every piece of text is escaped and only the tags
 *   below are ever emitted. Raw HTML in the source is shown as text, except the
 *   attribute-less inline tags the site's Markdown editor toolbar inserts
 *   (`<u>`, `<s>`, `<small>`, `<sub>`, `<sup>`, `<b>`, `<i>`, `<br>`).
 * - Then sanitized again with sanitize-html against the same allowlist, which
 *   also balances any unclosed toolbar tag.
 * - Links: http(s) only, `rel="noopener noreferrer"`. Images are never
 *   embedded; they become a link to the image.
 * - Inline styles only (Gmail drops <style> in many contexts, Outlook ignores
 *   most CSS), coloured to match the dark email layout.
 * - Long bodies are cut at a block boundary with a "view on SC Market" link.
 *
 * `renderEmailPlainText` is the same pipeline for fields the site shows as
 * plain text (invite messages, reviews): escaped, line breaks kept.
 */

import { Lexer, type Token, type Tokens } from "marked"
import sanitizeHtml from "sanitize-html"

/** Plain-text characters kept before a body is cut. */
export const DEFAULT_MAX_CHARS = 1500
/** Input beyond this is never parsed (bounds work on hostile input). */
const MAX_SOURCE_CHARS = 20000

export interface EmailMarkdownOptions {
  /** Where the full text can be read; used for the truncation link. */
  readMoreUrl?: string
  /** Plain-text characters to keep before truncating. */
  maxChars?: number
}

export interface EmailMarkdownResult {
  /** Sanitized HTML. The only value that may go into a triple-stash. */
  html: string
  /** text/plain rendering. */
  text: string
  truncated: boolean
}

const COLORS = {
  text: "#b7b7b7",
  heading: "#e8e8e8",
  link: "#7a7efe",
  accent: "#10b881",
  codeBg: "rgba(45, 55, 72, 0.8)",
  border: "rgb(45, 55, 72)",
}

const STYLE = {
  p: `margin: 0 0 12px 0; color: ${COLORS.text};`,
  h1: `margin: 16px 0 8px 0; font-size: 22px; line-height: 1.3; color: ${COLORS.heading};`,
  h2: `margin: 16px 0 8px 0; font-size: 19px; line-height: 1.3; color: ${COLORS.heading};`,
  h3: `margin: 14px 0 6px 0; font-size: 17px; line-height: 1.3; color: ${COLORS.heading};`,
  h4: `margin: 12px 0 6px 0; font-size: 15px; line-height: 1.3; color: ${COLORS.heading};`,
  ul: `margin: 0 0 12px 0; padding-left: 24px; color: ${COLORS.text};`,
  ol: `margin: 0 0 12px 0; padding-left: 24px; color: ${COLORS.text};`,
  li: `margin: 0 0 4px 0; color: ${COLORS.text};`,
  blockquote: `margin: 0 0 12px 0; padding: 8px 12px; border-left: 3px solid ${COLORS.accent}; font-style: italic; color: ${COLORS.text};`,
  pre: `margin: 0 0 12px 0; padding: 10px 12px; background-color: ${COLORS.codeBg}; border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-family: Consolas, Menlo, monospace; font-size: 13px; color: ${COLORS.heading};`,
  code: `padding: 1px 4px; background-color: ${COLORS.codeBg}; border-radius: 4px; font-family: Consolas, Menlo, monospace; font-size: 13px; color: ${COLORS.heading};`,
  a: `color: ${COLORS.link}; text-decoration: underline;`,
  hr: `border: 0; border-top: 1px solid ${COLORS.border}; margin: 16px 0;`,
} as const

/** Tags the editor toolbar inserts as raw HTML; no attributes, ever. */
const TOOLBAR_TAGS = ["u", "s", "small", "sub", "sup", "b", "i"] as const
const TOOLBAR_TAG_RE = new RegExp(`^<(/?)(${TOOLBAR_TAGS.join("|")})>$`, "i")
const BR_TAG_RE = /^<br\s*\/?>$/i

export const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  ...TOOLBAR_TAGS,
]

const ALLOWED_STYLE_PROPS = [
  "margin",
  "padding",
  "padding-left",
  "font-size",
  "font-style",
  "font-family",
  "line-height",
  "color",
  "background-color",
  "border",
  "border-top",
  "border-left",
  "border-radius",
  "white-space",
  "word-break",
  "text-decoration",
]

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "rel", "target", "style"],
    ol: ["start", "style"],
  },
  allowedSchemes: ["http", "https"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  allowedStyles: {
    "*": Object.fromEntries(
      ALLOWED_STYLE_PROPS.map((prop) => [prop, [/^[\w\s#%.,()'"/-]+$/]]),
    ),
  },
  disallowedTagsMode: "escape",
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Absolute http(s) URL, or null. */
export function safeHttpUrl(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Discord-style `<t:unix:F>` timestamps (used in chat messages) as UTC text;
 * the site formats them in the reader's locale, which an email can't know.
 */
function replaceDiscordTimestamps(input: string): string {
  return input.replace(/<t:(\d{1,12}):[dDtTfFR]>/g, (_m, seconds: string) => {
    const date = new Date(Number(seconds) * 1000)
    if (Number.isNaN(date.getTime())) return _m
    return `${date.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })} UTC`
  })
}

function attr(name: string, value: string): string {
  return ` ${name}="${escapeHtml(value)}"`
}

function link(href: string, inner: string): string {
  return `<a${attr("href", href)} target="_blank" rel="noopener noreferrer"${attr("style", STYLE.a)}>${inner}</a>`
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function inlineHtml(tokens: Token[] | undefined): string {
  if (!tokens) return ""
  return tokens.map(inlineTokenHtml).join("")
}

function inlineTokenHtml(token: Token): string {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text
      return t.tokens ? inlineHtml(t.tokens) : escapeHtml(t.text)
    }
    case "escape":
      return escapeHtml((token as Tokens.Escape).text)
    case "strong":
      return `<strong>${inlineHtml((token as Tokens.Strong).tokens)}</strong>`
    case "em":
      return `<em>${inlineHtml((token as Tokens.Em).tokens)}</em>`
    case "del":
      return `<s>${inlineHtml((token as Tokens.Del).tokens)}</s>`
    case "codespan":
      return `<code${attr("style", STYLE.code)}>${escapeHtml((token as Tokens.Codespan).text)}</code>`
    case "br":
      return "<br>"
    case "link": {
      const t = token as Tokens.Link
      const inner = inlineHtml(t.tokens)
      const href = safeHttpUrl(t.href)
      return href ? link(href, inner) : inner
    }
    case "image": {
      // Never embedded: remote images are tracking pixels in an inbox.
      const t = token as Tokens.Image
      const href = safeHttpUrl(t.href)
      const label = escapeHtml(t.text ? `Image: ${t.text}` : "Image")
      return href ? link(href, `[${label}]`) : `[${label}]`
    }
    case "html": {
      const raw = (token as Tokens.HTML).text.trim()
      const toolbar = TOOLBAR_TAG_RE.exec(raw)
      if (toolbar) return `<${toolbar[1]}${toolbar[2].toLowerCase()}>`
      if (BR_TAG_RE.test(raw)) return "<br>"
      return escapeHtml((token as Tokens.HTML).text)
    }
    case "checkbox":
      return (token as Tokens.Checkbox).checked ? "[x] " : "[ ] "
    default:
      return "raw" in token ? escapeHtml(String(token.raw)) : ""
  }
}

function blocksHtml(tokens: Token[]): string {
  return tokens.map(blockTokenHtml).join("")
}

function blockTokenHtml(token: Token): string {
  switch (token.type) {
    case "space":
    case "def":
      return ""
    case "paragraph":
      return `<p${attr("style", STYLE.p)}>${inlineHtml((token as Tokens.Paragraph).tokens)}</p>`
    case "heading": {
      const t = token as Tokens.Heading
      const tag = `h${Math.min(Math.max(t.depth, 1), 4)}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
      return `<${tag}${attr("style", STYLE[tag])}>${inlineHtml(t.tokens)}</${tag}>`
    }
    case "code":
      return `<pre${attr("style", STYLE.pre)}><code>${escapeHtml((token as Tokens.Code).text)}</code></pre>`
    case "blockquote":
      return `<blockquote${attr("style", STYLE.blockquote)}>${blocksHtml((token as Tokens.Blockquote).tokens)}</blockquote>`
    case "hr":
      return `<hr${attr("style", STYLE.hr)}>`
    case "list": {
      const t = token as Tokens.List
      const tag = t.ordered ? "ol" : "ul"
      const start =
        t.ordered && typeof t.start === "number" && t.start !== 1
          ? attr("start", String(t.start))
          : ""
      const items = t.items
        .map(
          (item) => `<li${attr("style", STYLE.li)}>${listItemHtml(item)}</li>`,
        )
        .join("")
      return `<${tag}${start}${attr("style", STYLE[tag])}>${items}</${tag}>`
    }
    case "table": {
      // No <table> in the allowlist: one line per row, header row in bold.
      const t = token as Tokens.Table
      const row = (cells: Tokens.TableCell[]) =>
        cells.map((c) => inlineHtml(c.tokens)).join(" | ")
      const lines = [`<strong>${row(t.header)}</strong>`, ...t.rows.map(row)]
      return `<p${attr("style", STYLE.p)}>${lines.join("<br>")}</p>`
    }
    case "html":
      return `<p${attr("style", STYLE.p)}>${escapeHtml((token as Tokens.HTML).text.trim()).replace(/\n/g, "<br>")}</p>`
    case "text": {
      const t = token as Tokens.Text
      return `<p${attr("style", STYLE.p)}>${t.tokens ? inlineHtml(t.tokens) : escapeHtml(t.text)}</p>`
    }
    default:
      return "raw" in token
        ? `<p${attr("style", STYLE.p)}>${escapeHtml(String(token.raw))}</p>`
        : ""
  }
}

function listItemHtml(item: Tokens.ListItem): string {
  // Tight items hold bare `text` tokens; loose ones hold paragraphs.
  return item.tokens
    .map((t) => {
      if (t.type === "text") return inlineTokenHtml(t)
      if (t.type === "checkbox") return inlineTokenHtml(t)
      return blockTokenHtml(t)
    })
    .join("")
}

// ---------------------------------------------------------------------------
// Plain-text rendering
// ---------------------------------------------------------------------------

function inlineText(tokens: Token[] | undefined): string {
  if (!tokens) return ""
  return tokens.map(inlineTokenText).join("")
}

function inlineTokenText(token: Token): string {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text
      return t.tokens ? inlineText(t.tokens) : t.text
    }
    case "escape":
      return (token as Tokens.Escape).text
    case "strong":
    case "em":
    case "del":
      return inlineText((token as Tokens.Strong).tokens)
    case "codespan":
      return (token as Tokens.Codespan).text
    case "br":
      return "\n"
    case "link": {
      const t = token as Tokens.Link
      const label = inlineText(t.tokens)
      const href = safeHttpUrl(t.href)
      if (!href || label === t.href || label === href) return label
      return `${label} (${href})`
    }
    case "image": {
      const t = token as Tokens.Image
      const href = safeHttpUrl(t.href)
      const label = t.text ? `[Image: ${t.text}]` : "[Image]"
      return href ? `${label} (${href})` : label
    }
    case "html": {
      const raw = (token as Tokens.HTML).text.trim()
      if (TOOLBAR_TAG_RE.test(raw)) return ""
      if (BR_TAG_RE.test(raw)) return "\n"
      return (token as Tokens.HTML).text
    }
    case "checkbox":
      return (token as Tokens.Checkbox).checked ? "[x] " : "[ ] "
    default:
      return "raw" in token ? String(token.raw) : ""
  }
}

function indent(text: string, prefix: string, first = prefix): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? first : prefix) + line)
    .join("\n")
}

function blockTokenText(token: Token): string {
  switch (token.type) {
    case "space":
    case "def":
      return ""
    case "paragraph":
      return inlineText((token as Tokens.Paragraph).tokens)
    case "heading":
      return inlineText((token as Tokens.Heading).tokens)
    case "code":
      return indent((token as Tokens.Code).text, "    ")
    case "blockquote":
      return indent(blocksText((token as Tokens.Blockquote).tokens), "> ")
    case "hr":
      return "---"
    case "list": {
      const t = token as Tokens.List
      const start = typeof t.start === "number" ? t.start : 1
      return t.items
        .map((item, i) => {
          const marker = t.ordered ? `${start + i}. ` : "- "
          const body = item.tokens
            .map((c) =>
              c.type === "text" || c.type === "checkbox"
                ? inlineTokenText(c)
                : blockTokenText(c),
            )
            .filter((s) => s !== "")
            .join(item.loose ? "\n\n" : "")
          return indent(body, " ".repeat(marker.length), marker)
        })
        .join("\n")
    }
    case "table": {
      const t = token as Tokens.Table
      const row = (cells: Tokens.TableCell[]) =>
        cells.map((c) => inlineText(c.tokens)).join(" | ")
      return [row(t.header), ...t.rows.map(row)].join("\n")
    }
    case "html":
      return (token as Tokens.HTML).text.trim()
    case "text": {
      const t = token as Tokens.Text
      return t.tokens ? inlineText(t.tokens) : t.text
    }
    default:
      return "raw" in token ? String(token.raw) : ""
  }
}

function blocksText(tokens: Token[]): string {
  return tokens
    .map(blockTokenText)
    .filter((s) => s !== "")
    .join("\n\n")
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.search(/\s\S*$/)
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()
}

function readMore(url: string | undefined): { html: string; text: string } {
  const href = safeHttpUrl(url)
  if (!href) return { html: "", text: "" }
  return {
    html: `<p${attr("style", STYLE.p)}>${link(href, "Read the full text on SC Market")}</p>`,
    text: `Read the full text on SC Market: ${href}`,
  }
}

function finish(
  htmlParts: string[],
  textParts: string[],
  truncated: boolean,
  options: EmailMarkdownOptions,
): EmailMarkdownResult {
  if (truncated) {
    const more = readMore(options.readMoreUrl)
    htmlParts.push(`<p${attr("style", STYLE.p)}>&hellip;</p>`)
    textParts.push("...")
    if (more.html) {
      htmlParts.push(more.html)
      textParts.push(more.text)
    }
  }
  return {
    html: sanitizeHtml(htmlParts.join(""), SANITIZE_OPTIONS),
    text: textParts.filter((s) => s !== "").join("\n\n"),
    truncated,
  }
}

/** Markdown source (as the site renders it) to sanitized email HTML + text. */
export function renderEmailMarkdown(
  source: string | null | undefined,
  options: EmailMarkdownOptions = {},
): EmailMarkdownResult {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const input = String(source ?? "").replace(/\r\n?/g, "\n")
  if (!input.trim()) return { html: "", text: "", truncated: false }

  const tokens = Lexer.lex(
    replaceDiscordTimestamps(input.slice(0, MAX_SOURCE_CHARS)),
    { gfm: true, breaks: false },
  )

  const htmlParts: string[] = []
  const textParts: string[] = []
  let used = 0
  let truncated = input.length > MAX_SOURCE_CHARS

  for (const token of tokens) {
    const text = blockTokenText(token)
    if (text === "") continue
    if (used + text.length > maxChars) {
      truncated = true
      // Nothing kept yet: keep the start of this block, as escaped text.
      if (htmlParts.length === 0) {
        const cut = cutAtWord(text, maxChars)
        htmlParts.push(
          `<p${attr("style", STYLE.p)}>${escapeHtml(cut).replace(/\n/g, "<br>")}</p>`,
        )
        textParts.push(cut)
      }
      break
    }
    used += text.length + 2
    htmlParts.push(blockTokenHtml(token))
    textParts.push(text)
  }

  return finish(htmlParts, textParts, truncated, options)
}

/**
 * Text the site shows verbatim (invite messages, reviews): escaped, with
 * paragraphs and line breaks kept, and the same truncation.
 */
export function renderEmailPlainText(
  source: string | null | undefined,
  options: EmailMarkdownOptions = {},
): EmailMarkdownResult {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const input = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
  if (!input) return { html: "", text: "", truncated: false }

  const truncated = input.length > maxChars
  const kept = truncated ? cutAtWord(input, maxChars) : input
  const paragraphs = kept.split(/\n{2,}/).filter((p) => p.trim() !== "")

  return finish(
    paragraphs.map(
      (p) =>
        `<p${attr("style", STYLE.p)}>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    ),
    paragraphs,
    truncated,
    options,
  )
}
