const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_SLUG_REGEX = /^([0-9a-f]{8})--.+$/i

export function formatShortSlug(id: string, name: string): string {
  const prefix = id.replace(/-/g, "").slice(0, 8)
  const slug = name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
  return `${prefix}--${slug}`
}

export function parseShortSlug(param: string): {
  prefix: string
  isFullUuid: boolean
} {
  if (UUID_REGEX.test(param)) {
    return { prefix: param, isFullUuid: true }
  }
  const match = param.match(SHORT_SLUG_REGEX)
  if (match) {
    return { prefix: match[1], isFullUuid: false }
  }
  return { prefix: param, isFullUuid: true }
}

export function buildUuidRangeQuery(
  prefix: string,
  column: string,
): { sql: string; bindings: string[] } {
  const low = `${prefix}-0000-0000-0000-000000000000`
  const highPrefix = (parseInt(prefix, 16) + 1).toString(16).padStart(8, "0")
  const high = `${highPrefix}-0000-0000-0000-000000000000`
  return {
    sql: `${column} >= ?::uuid AND ${column} < ?::uuid`,
    bindings: [low, high],
  }
}
