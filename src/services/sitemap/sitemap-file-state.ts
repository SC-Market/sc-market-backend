import type { Knex } from "knex"

/**
 * sitemap_file_state: per sitemap file (e.g. "wiki-1"), the hash of its URL
 * entries and when they last changed. The index <lastmod> of a file whose URLs
 * have no dates of their own (static, contractors, recruiting, users, wiki)
 * is that time, so it survives deploys and restarts instead of resetting to
 * the first build of each process.
 */
export const SITEMAP_FILE_STATE_TABLE = "sitemap_file_state"

export interface StoredSitemapFile {
  hash: string
  /** ISO datetime */
  changedAt: string
}

export interface SitemapFileChange extends StoredSitemapFile {
  key: string
}

/** Every stored file's hash and last-changed time, by file key. */
export async function loadSitemapFileState(
  db: Knex,
): Promise<Map<string, StoredSitemapFile>> {
  const rows: {
    file_key: string
    content_hash: string
    last_changed_at: unknown
  }[] = await db(SITEMAP_FILE_STATE_TABLE).select(
    "file_key",
    "content_hash",
    "last_changed_at",
  )
  const state = new Map<string, StoredSitemapFile>()
  for (const row of rows) {
    const changed =
      row.last_changed_at instanceof Date
        ? row.last_changed_at
        : new Date(String(row.last_changed_at))
    if (Number.isNaN(changed.getTime())) continue
    state.set(row.file_key, {
      hash: row.content_hash,
      changedAt: changed.toISOString(),
    })
  }
  return state
}

/** Write the files whose content changed (replacing their rows). */
export async function saveSitemapFileChanges(
  db: Knex,
  changes: SitemapFileChange[],
): Promise<void> {
  if (changes.length === 0) return
  await db.transaction(async (trx) => {
    await trx(SITEMAP_FILE_STATE_TABLE)
      .whereIn(
        "file_key",
        changes.map((change) => change.key),
      )
      .del()
    await trx(SITEMAP_FILE_STATE_TABLE).insert(
      changes.map((change) => ({
        file_key: change.key,
        content_hash: change.hash,
        last_changed_at: new Date(change.changedAt),
      })),
    )
  })
}
