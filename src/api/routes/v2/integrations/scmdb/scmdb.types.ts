export interface ScmdbIngestResponse {
  ok: boolean
}

export interface ScmdbConnectResponse {
  ingest_url: string
}

export interface ScmdbStatusResponse {
  is_connected: boolean
  ingest_url: string | null
  last_event_at: string | null
  created_at: string | null
}
