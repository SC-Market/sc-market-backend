import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

// Spectrum API endpoints
const SPECTRUM_API_BASE = "https://robertsspaceindustries.com"
const FETCH_MEMBER_BY_HANDLE = "/api/spectrum/member/info/nickname"
const FETCH_MEMBER_BY_ID = "/api/spectrum/member/info/id"

// Response types - based on actual API responses
export interface SpectrumMemberResponse {
  success: number | boolean
  code: string
  msg: string
  data: {
    member: {
      id: string
      displayname: string
      nickname: string
      avatar?: string
      signature?: string
      meta?: {
        badges?: Array<{
          name: string
          icon: string
          url?: string
        }>
        isGM?: boolean
        spoken_languages?: string[]
      }
    }
  }
  message?: string
}

export interface SpectrumError {
  success: false
  message: string
  code?: string
}

export class SpectrumAPIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = "SpectrumAPIError"
  }
}

export class SpectrumAPIClient {
  private baseUrl: string
  private headers: Record<string, string>
  private cookies: Record<string, string>

  constructor(
    private rsiToken?: string,
    private deviceId?: string,
  ) {
    this.baseUrl = SPECTRUM_API_BASE
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.5",
      Referer:
        "https://robertsspaceindustries.com/spectrum/community/SC/lobby/1",
      Origin: "https://robertsspaceindustries.com",
      DNT: "1",
    }

    this.cookies = {
      _rsi_device: this.deviceId || "",
      "Rsi-Token": this.rsiToken || "",
    }

    if (this.rsiToken) {
      this.headers["X-Rsi-Token"] = this.rsiToken
    }
  }

  /**
   * Fetch a Spectrum member by their RSI handle (nickname)
   * @param handle - The RSI handle/nickname to search for
   * @returns Promise<SpectrumMemberResponse> - The member information
   */
  async fetchMemberByHandle(handle: string): Promise<SpectrumMemberResponse> {
    const payload = { nickname: handle }
    return this.makeRequest(FETCH_MEMBER_BY_HANDLE, payload)
  }

  /**
   * Fetch a Spectrum member by their member ID
   * @param memberId - The Spectrum member ID to search for
   * @returns Promise<SpectrumMemberResponse> - The member information
   */
  async fetchMemberById(memberId: string): Promise<SpectrumMemberResponse> {
    const payload = { member_id: memberId }
    return this.makeRequest(FETCH_MEMBER_BY_ID, payload)
  }

  /**
   * Get the Spectrum user ID from an RSI handle
   * This is a convenience method that extracts just the ID from the full response
   * @param handle - The RSI handle/nickname to search for
   * @returns Promise<string | null> - The Spectrum user ID, or null if not found
   */
  async getSpectrumUserId(handle: string): Promise<string | null> {
    try {
      const response = await this.fetchMemberByHandle(handle)
      if (
        response.success &&
        (response.success === 1 || response.success === true) &&
        response.data?.member?.id
      ) {
        logger.debug(
          `Found Spectrum user ID ${response.data.member.id} for handle ${handle}`,
        )
        return response.data.member.id
      } else {
        logger.debug(
          `No Spectrum user found for handle ${handle} ${JSON.stringify(response)}`,
        )
        return null
      }
    } catch (error) {
      logger.debug(
        `Failed to get Spectrum user ID for handle ${handle}: ${error}`,
      )
      return null
    }
  }

  /**
   * Make a request to the Spectrum API
   * @param endpoint - The API endpoint to call
   * @param payload - The request payload
   * @returns Promise<SpectrumMemberResponse> - The API response
   */
  private async makeRequest(
    endpoint: string,
    payload: Record<string, any>,
  ): Promise<SpectrumMemberResponse> {
    const url = `${this.baseUrl}${endpoint}`

    logger.debug(`Making Spectrum API request to ${endpoint}`, { payload })

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers,
          "X-Tavern-action-id": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      })

      if (!response.ok) {
        throw new SpectrumAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          undefined,
          response.status,
        )
      }

      const responseData = await response.json()

      if (!responseData) {
        throw new SpectrumAPIError("Empty response from Spectrum API")
      }

      if (
        responseData.success &&
        (responseData.success === 1 || responseData.success === true)
      ) {
        logger.debug(`Spectrum API request successful for ${endpoint}`)
        return responseData as SpectrumMemberResponse
      } else {
        const errorMessage =
          responseData.message ||
          responseData.msg ||
          "Unknown error from Spectrum API"
        const errorCode = responseData.code
        logger.debug(
          `Spectrum API request failed for ${endpoint}: ${errorMessage}`,
          { errorCode },
        )
        throw new SpectrumAPIError(errorMessage, errorCode)
      }
    } catch (error) {
      if (error instanceof SpectrumAPIError) {
        throw error
      }

      logger.debug(
        `Network error making Spectrum API request to ${endpoint}: ${error}`,
      )
      throw new SpectrumAPIError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// Export a default instance for convenience
export const spectrumAPI = new SpectrumAPIClient(
  env.RSI_TOKEN,
  env.RSI_DEVICE_ID,
)

// Export convenience functions
export async function getSpectrumUserId(
  handle: string,
): Promise<string | null> {
  return spectrumAPI.getSpectrumUserId(handle)
}

export async function fetchSpectrumMemberByHandle(
  handle: string,
): Promise<SpectrumMemberResponse> {
  return spectrumAPI.fetchMemberByHandle(handle)
}

export async function fetchSpectrumMemberById(
  memberId: string,
): Promise<SpectrumMemberResponse> {
  return spectrumAPI.fetchMemberById(memberId)
}
