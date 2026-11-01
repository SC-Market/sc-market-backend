/**
 * SQL for an image_resources row's public URL, the joined form of
 * resolveImageUrl: NULL when the join found no row. `alias` is a code literal.
 */
export function imageUrlSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`imageUrlSql: invalid alias ${alias}`)
  return `CASE WHEN ${alias}.resource_id IS NULL THEN NULL ELSE COALESCE(NULLIF(${alias}.external_url, ''), 'https://cdn.sc-market.space/' || ${alias}.filename) END`
}
