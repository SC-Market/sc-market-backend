/**
 * Manufacturer canonicalization for the P4K game-data import.
 *
 * The export emits one entry per `SCItemManufacturer` record under
 * `libs/foundry/records/scitemmanufacturer/**`, keyed by record file name
 * (`aegs`, `mxox`, `paint_arrow_lovestruck_pink_black_logo`, ...). Items and
 * ships reference manufacturers by that same file-name code.
 *
 * Only a minority of those records are brands. CIG also authors a
 * manufacturer record per paint/livery (`paintcolorlogos/`, ~950 records), per
 * shop kiosk, per UI style, and a few legacy duplicates (`mxox`, `fski`,
 * `xian`, `mrai_2025`, ...). What ties a record to its brand is its
 * `Localization.Name` key: every Anvil livery logo carries
 * `@manufacturer_NameANVL`, exactly like the `anvl` record. The in-game `Code`
 * field is not usable for this — it is empty on liveries and inconsistent on
 * brands (`aegs` → "AEG", `behr` → "BEH", `klwe` → "KLA", and both `misc` and
 * `mrai` → "MIS").
 *
 * So: records sharing a `@manufacturer_Name<X>` key are one brand, and the
 * brand's canonical code is the record whose code is `<x>` (lowercased), or
 * the shortest code in the group when no record matches (`@..._NameASAD` →
 * `asd`, `@..._NameOrigin` → `orig`). Records without a manufacturer key
 * (shop kiosks, UI styles, placeholders) are not brands and are left alone.
 *
 * CIG also marks unfinished localization strings with a "PH" (placeholder)
 * prefix: `asd` is localized as "PH Associated Science and Development" with
 * the description "PH Associated Science and Development Description". The
 * marker is stripped from brand names, and a marked description is
 * placeholder text, dropped like `@LOC_PLACEHOLDER` values are.
 */

import type { P4KManufacturer } from "./import.service.js"

/** `wiki_manufacturers.code` / `.name` column widths. */
export const MANUFACTURER_CODE_MAX = 50
export const MANUFACTURER_NAME_MAX = 200

/**
 * Brand suffix of a manufacturer localization key, lowercased.
 *
 * `@manufacturer_NameAEGS` → `aegs`. Two Krueger livery records point their
 * Name at `@manufacturer_DescKRIG`, so the Desc variant is accepted too.
 * Anything else (`@LOC_PLACEHOLDER`, `@item_NameShop_CasabaOutlet`, ...) is
 * not a brand key and yields null.
 */
export function brandKeyOf(nameKey: string | null | undefined): string | null {
  if (!nameKey) return null
  const match = /^@manufacturer_(?:Name|Desc)(.+)$/i.exec(nameKey.trim())
  return match ? match[1].toLowerCase() : null
}

/** "PH Foo", "PH - Foo": CIG's marker for placeholder localization text. */
const PLACEHOLDER_MARKER = /^PH(?:\s+-\s*|\s+)/

/**
 * Localized text with CIG's "PH" placeholder marker removed:
 * "PH Associated Science and Development" → "Associated Science and
 * Development". Unmarked text is returned unchanged; null when nothing is left.
 */
export function stripPlaceholderMarker(text: string | null | undefined): string | null {
  if (!text) return null
  const stripped = text.replace(PLACEHOLDER_MARKER, "").trim()
  return stripped || null
}

/** A description, or null when it is placeholder text ("PH - Rambler Description"). */
function realDescription(text: string | null | undefined): string | null {
  if (!text || PLACEHOLDER_MARKER.test(text)) return null
  return text
}

export interface CanonicalManufacturer {
  code: string
  name: string
  nameKey: string | null
  description: string | null
}

export interface ManufacturerCanonicalization {
  /** One entry per brand — what belongs in `wiki_manufacturers`. */
  brands: CanonicalManufacturer[]
  /** Record code (lowercased) → canonical brand code, for every brand record. */
  aliasToCanonical: Map<string, string>
}

export function canonicalizeManufacturers(
  manufacturers: P4KManufacturer[],
): ManufacturerCanonicalization {
  const groups = new Map<string, P4KManufacturer[]>()
  for (const mfr of manufacturers) {
    if (!mfr.code) continue
    const brand = brandKeyOf(mfr.nameKey)
    if (!brand) continue
    const group = groups.get(brand)
    if (group) group.push(mfr)
    else groups.set(brand, [mfr])
  }

  const brands: CanonicalManufacturer[] = []
  const aliasToCanonical = new Map<string, string>()

  for (const [brand, records] of groups) {
    const canonical =
      records.find((r) => r.code.toLowerCase() === brand) ??
      [...records].sort(
        (a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code),
      )[0]

    const code = canonical.code.toLowerCase()

    brands.push({
      code,
      // Siblings share the Name key, so they share the localized name; the
      // export already falls back to the record code when the key is unlocalized.
      name: stripPlaceholderMarker(canonical.name) || canonical.code,
      nameKey: canonical.nameKey,
      description:
        realDescription(canonical.description) ??
        records.map((r) => realDescription(r.description)).find(Boolean) ??
        null,
    })
    for (const record of records) {
      aliasToCanonical.set(record.code.toLowerCase(), code)
    }
  }

  brands.sort((a, b) => a.code.localeCompare(b.code))
  return { brands, aliasToCanonical }
}

/**
 * Canonical brand code for a raw item/ship manufacturer reference. Codes that
 * are not brand records (e.g. `volt`, whose name is still a placeholder) are
 * returned unchanged.
 */
export function canonicalManufacturerCode(
  aliasToCanonical: Map<string, string>,
  code: string | null | undefined,
): string | null {
  if (!code) return null
  return aliasToCanonical.get(code.toLowerCase()) ?? code
}

/**
 * The manufacturer code to write over an already-imported game_items row, or
 * null when it needs no change. The import skips rows it has seen before
 * (matched by p4k_id), so without this a row imported before its code was
 * recognized as a brand alias (`mxox` → `aegs`, `xian` → `xnaa`) keeps the
 * alias forever. An export with no manufacturer for the item never clears a
 * stored one.
 */
export function manufacturerRecode(
  stored: string | null | undefined,
  canonical: string | null | undefined,
): string | null {
  if (!canonical || stored === canonical) return null
  return canonical
}
