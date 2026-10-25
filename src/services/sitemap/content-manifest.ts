import { EnumChangefreq, SitemapItemLoose } from "sitemap"

import logger from "../../logger/logger.js"

/**
 * Help & Guides / About pages are Markdown compiled by the frontend build, so
 * the backend can't list them from the database. The frontend build publishes
 * a manifest of every content page at `<FRONTEND_URL>/content/manifest.json`
 * (a static Cloudflare Pages asset), which the sitemap fetches on each rebuild.
 *
 * Failing safely: any problem (timeout, non-200, bad JSON, wrong shape) yields
 * `null`, which the sitemap treats as "no content URLs" for this build and
 * retries sooner than the normal TTL. The rest of the sitemap is unaffected.
 */
export const CONTENT_MANIFEST_PATH = "/content/manifest.json"
export const CONTENT_MANIFEST_TIMEOUT_MS = 5_000

/** The manifest format the frontend emits (scripts/content/lib.ts there). */
export interface ContentManifest {
  version: 1
  pages: { path: string; updated: string }[]
}

/** Only content paths: never an arbitrary URL a bad manifest could inject. */
const CONTENT_PATH =
  /^\/(?:guides|about|blog)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isManifest(value: unknown): value is ContentManifest {
  if (typeof value !== "object" || value === null) return false
  const { version, pages } = value as { version?: unknown; pages?: unknown }
  return version === 1 && Array.isArray(pages)
}

export function manifestToSitemapPages(
  manifest: ContentManifest,
): SitemapItemLoose[] {
  const pages: SitemapItemLoose[] = []
  const seen = new Set<string>()
  for (const page of manifest.pages) {
    if (typeof page?.path !== "string" || !CONTENT_PATH.test(page.path))
      continue
    if (seen.has(page.path)) continue
    seen.add(page.path)
    pages.push({
      url: page.path,
      changefreq: EnumChangefreq.MONTHLY,
      priority: page.path === "/guides" ? 0.7 : 0.6,
      ...(typeof page.updated === "string" && ISO_DATE.test(page.updated)
        ? { lastmod: page.updated }
        : {}),
    })
  }
  return pages
}

/** Fetch the content manifest; `null` means "unavailable this time". */
export async function fetchContentSitemapPages(
  frontendOrigin: string,
): Promise<SitemapItemLoose[] | null> {
  const url = new URL(CONTENT_MANIFEST_PATH, frontendOrigin).toString()
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(CONTENT_MANIFEST_TIMEOUT_MS),
    })
    const contentType = response.headers.get("content-type") ?? ""
    if (!response.ok || !contentType.includes("application/json")) {
      logger.warn("Content manifest unavailable; sitemap has no guide URLs", {
        url,
        status: response.status,
        contentType,
      })
      return null
    }
    const json: unknown = await response.json()
    if (!isManifest(json)) {
      logger.warn(
        "Content manifest has an unexpected shape; sitemap has no guide URLs",
        { url },
      )
      return null
    }
    return manifestToSitemapPages(json)
  } catch (error) {
    logger.warn("Content manifest fetch failed; sitemap has no guide URLs", {
      url,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
