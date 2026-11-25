import { decodeHTMLStrict } from "entities"

/**
 * Text RSI serves as HTML (org names, scraped profile fields) arrives with
 * HTML entities: "Crash&rsquo;s Candy Shop", "Rock &amp; Stone",
 * "Latinoam&eacute;rica". Decode them once, where the text enters SC Market,
 * so the database and every API response hold the real characters and each
 * output path (React, meta tags, JSON-LD, Discord) escapes them once itself.
 *
 * Single pass, named + decimal + hex references, semicolon required:
 * "&amp;rsquo;" becomes the text "&rsquo;", and "AT&T" or "&bogus;" stay
 * as written.
 */
export function decodeHtmlEntities(text: string): string {
  return decodeHTMLStrict(text)
}

/** A markup fragment cut from an RSI page as plain text: tags dropped, entities decoded once. */
export function rsiHtmlToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).trim()
}

/** Whether `text` holds something that looks like an HTML entity reference. */
export const HTML_ENTITY_PATTERN = /&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/
