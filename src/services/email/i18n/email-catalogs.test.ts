/**
 * The email catalogs (./catalogs, see ./index.ts): the email equivalent of
 * the frontend's localeCatalogs test. Every locale carries every en key,
 * with the plural forms its language needs, and the same {placeholders} and
 * <b> / <link> tags as en; every key a template reads exists; every template
 * has a subject.
 */
import { readFileSync, readdirSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { EMAIL_CATALOGS, EMAIL_LOCALES, languageTag } from "./index.js"

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates")
const en = EMAIL_CATALOGS.en
const PLURAL = /_(zero|one|two|few|many|other)$/

/** Base keys: plural groups ("x" for "x_one", "x_other", …) and plain keys. */
function groups(catalog: Record<string, string>) {
  const plural = new Map<string, string[]>()
  const plain: string[] = []
  for (const key of Object.keys(catalog)) {
    const m = key.match(PLURAL)
    if (m) {
      const base = key.slice(0, -m[0].length)
      plural.set(base, [...(plural.get(base) ?? []), m[1]])
    } else plain.push(key)
  }
  return { plural, plain }
}

/**
 * The plural forms a language needs for a group: "other", plus every
 * category its integers fall in. ".multiple" groups are only used for two or
 * more (count 1 has its own ".single" wording).
 */
function requiredForms(locale: (typeof EMAIL_LOCALES)[number], base: string): string[] {
  const rules = new Intl.PluralRules(languageTag(locale))
  const from = base.endsWith(".multiple") ? 2 : 0
  const forms = new Set(["other"])
  for (let n = from; n <= 1000; n++) forms.add(rules.select(n))
  return [...forms].sort()
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const tags = (s: string) => [...s.matchAll(/<\/?[a-z]+>/g)].map((m) => m[0]).sort()

/** The en string a locale's key is compared with (a plural group: its "other" form). */
function enFor(key: string): string {
  return en[key] ?? en[key.replace(PLURAL, "_other")]
}

const enGroups = groups(en)

describe("email catalogs", () => {
  it("cover the 8 site languages", () => {
    expect([...EMAIL_LOCALES].sort()).toEqual(["de", "en", "es", "fr", "ja", "uk", "zh_Hans", "zh_Hant"])
  })

  for (const locale of EMAIL_LOCALES) {
    const catalog = EMAIL_CATALOGS[locale]
    const { plural, plain } = groups(catalog)

    it(`${locale} has every en key, and no other`, () => {
      const missing = enGroups.plain.filter((k) => !(k in catalog))
      const missingPlural = [...enGroups.plural.keys()].filter((k) => !plural.has(k))
      const extra = [
        ...plain.filter((k) => !(k in en)),
        ...[...plural.keys()].filter((k) => !enGroups.plural.has(k)),
      ]
      expect(missing).toEqual([])
      expect(missingPlural).toEqual([])
      expect(extra).toEqual([])
    })

    it(`${locale} has the plural forms its language needs`, () => {
      const wrong: string[] = []
      for (const [base, forms] of plural) {
        const need = requiredForms(locale, base)
        const have = [...forms].sort()
        if (need.join() !== have.join()) wrong.push(`${base}: has ${have.join(",")}, needs ${need.join(",")}`)
      }
      expect(wrong).toEqual([])
    })

    it(`${locale} keeps en placeholders and tags`, () => {
      const wrong: string[] = []
      for (const [key, value] of Object.entries(catalog)) {
        const ref = enFor(key)
        if (ref === undefined) continue
        if (placeholders(value).join() !== placeholders(ref).join()) wrong.push(`${key}: {${placeholders(value)}}`)
        if (tags(value).join() !== tags(ref).join()) wrong.push(`${key}: ${tags(value).join("")}`)
        if (!value.trim()) wrong.push(`${key}: empty`)
      }
      expect(wrong).toEqual([])
    })
  }

  it("has every key the templates read, and a subject for every template", () => {
    const files = ["layouts", "notifications"].flatMap((dir) =>
      readdirSync(path.join(templatesDir, dir))
        .filter((f) => f.endsWith(".hbs") && !f.startsWith("."))
        .map((f) => path.join(templatesDir, dir, f)),
    )
    const unknown: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      for (const m of source.matchAll(/\{\{t "([^"]+)"/g)) {
        if (!(m[1] in en) && !enGroups.plural.has(m[1])) unknown.push(`${path.basename(file)}: ${m[1]}`)
      }
    }
    expect(unknown).toEqual([])

    const templates = new Set(
      files.filter((f) => f.includes(`${path.sep}notifications${path.sep}`)).map((f) => path.basename(f).split(".")[0]),
    )
    const keys = Object.keys(en)
    const noSubject = [...templates].filter((t) => !keys.some((k) => k.startsWith(`${t}.subject`)))
    expect(noSubject).toEqual([])
  })
})
