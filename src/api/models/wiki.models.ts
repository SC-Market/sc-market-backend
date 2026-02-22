/**
 * Wiki API Models
 * Type definitions for wiki search endpoints
 */

import { ApiResponse } from "./common.models.js"

/**
 * Wiki image thumbnail
 */
export interface WikiThumbnail {
  mimetype: string
  size: number
  width: number
  height: number
  duration: number | null
  url: string
}

/**
 * Wiki image info
 */
export interface WikiImageInfo {
  url: string
  thumburl: string
}

/**
 * Wiki image details
 */
export interface WikiImageDetails {
  pages?: Array<{
    imageinfo?: WikiImageInfo[]
  }>
}

/**
 * Wiki image search result
 */
export interface WikiImageSearchResult {
  id: number
  key: string
  title: string
  excerpt: string | null
  matched_title: string | null
  description: string | null
  thumbnail: WikiThumbnail | null
  images: WikiImageDetails | null
}

/**
 * Wiki page category
 */
export interface WikiCategory {
  title: string
}

/**
 * Wiki page info
 */
export interface WikiPageInfo {
  pageid: number
  title: string
  extract: string | null
  thumbnail?: {
    source: string
  } | null
  categories?: WikiCategory[]
}

/**
 * Wiki item search result
 */
export interface WikiItemSearchResult {
  query: {
    pages: {
      [key: string]: WikiPageInfo
    }
  }
}

/**
 * Wiki image search response
 */
export interface WikiImageSearchResponse extends ApiResponse<WikiImageSearchResult[]> {}

/**
 * Wiki item search response
 */
export interface WikiItemSearchResponse extends ApiResponse<WikiItemSearchResult> {}
