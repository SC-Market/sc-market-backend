import { RequestHandler, Response } from "express"
import logger from "../../../../logger/logger.js"
import { readJsonResponse, UpstreamResponseError } from "../../../../util/fetch-json.js"
import { createErrorResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

const SOURCE = "RSI starmap"

/**
 * The RSI starmap API sometimes answers with an HTML page (errors, Cloudflare
 * challenges). Answer 502 instead of letting the parse error become a 500.
 */
function upstreamUnavailable(res: Response, error: unknown): boolean {
  if (!(error instanceof UpstreamResponseError)) return false
  logger.warn("RSI starmap request failed", {
    status: error.status,
    contentType: error.contentType,
    bodyPreview: error.bodyPreview,
  })
  res
    .status(502)
    .json(createErrorResponse(ErrorCode.SERVICE_UNAVAILABLE, "The RSI starmap is unavailable right now"))
  return true
}

export const starmap_get_route_from_to: RequestHandler = async function (
  req,
  res,
) {
  try {
    const route = await getRoute(req.params.from, req.params.to)
    res.json(route)
  } catch (error) {
    if (!upstreamUnavailable(res, error)) throw error
  }
}

export const starmap_get_route_identifier: RequestHandler = async function (
  req,
  res,
) {
  try {
    const route = await getObject(req.params.identifier)
    res.json(route)
  } catch (error) {
    if (!upstreamUnavailable(res, error)) throw error
  }
}

export const starmap_get_search_query: RequestHandler = async function (
  req,
  res,
) {
  try {
    const results = await search(req.params.query)
    res.json(results)
  } catch (error) {
    if (!upstreamUnavailable(res, error)) throw error
  }
}
export async function getRoute(from: string, to: string, ship_size?: string) {
  const resp = await fetch(
    "https://robertsspaceindustries.com/api/starmap/routes/find",
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      body: JSON.stringify({
        departure: from,
        destination: to,
        ship_size: ship_size || "L",
      }),
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = await readJsonResponse<{ data: any }>(resp, SOURCE)
  return js.data
}

export async function search(query: string) {
  const resp = await fetch(
    "https://robertsspaceindustries.com/api/starmap/find",
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      body: JSON.stringify({
        query: query,
      }),
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = await readJsonResponse<any>(resp, SOURCE)
  return js.data
}

export async function getObject(identifier: string) {
  const resp = await fetch(
    // Encoded so the id stays one path segment: "../" or "?x" in it could
    // otherwise make this server-side request hit another RSI endpoint.
    `https://robertsspaceindustries.com/api/starmap/celestial-objects/${encodeURIComponent(identifier)}`,
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = await readJsonResponse<any>(resp, SOURCE)
  return js.data.resultset
}
