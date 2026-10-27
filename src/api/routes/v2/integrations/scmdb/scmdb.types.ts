export interface ScmdbIngestResponse {
  ok: boolean
}

export interface ScmdbConnectResponse {
  /** The ingest URL, containing the secret token. Returned only here, once. */
  ingest_url: string
}

export interface ScmdbStatusResponse {
  is_connected: boolean
  /**
   * Always null. The token is stored hashed, so the URL can't be shown again
   * after connect/regenerate returned it. Kept for older clients.
   * @deprecated
   */
  ingest_url: null
  /** Last 4 characters of the active token, e.g. to show "…ab12". */
  token_hint: string | null
  last_event_at: string | null
  created_at: string | null
}
