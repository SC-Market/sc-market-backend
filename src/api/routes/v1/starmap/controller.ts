import { RequestHandler } from "express"

export const starmap_get_route_from_to: RequestHandler = async function (
  req,
  res,
) {
  const route = await getRoute(req.params.from, req.params.to)
  res.json(route)
}

export const starmap_get_route_identifier: RequestHandler = async function (
  req,
  res,
) {
  const route = await getObject(req.params.identifier)
  res.json(route)
}

export const starmap_get_search_query: RequestHandler = async function (
  req,
  res,
) {
  const results = await search(req.params.query)
  res.json(results)
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
  const js = (await resp.json()) as { data: any }
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
  const js = (await resp.json()) as any
  return js.data
}

export async function getObject(identifier: string) {
  const resp = await fetch(
    `https://robertsspaceindustries.com/api/starmap/celestial-objects/${identifier}`,
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
  const js = (await resp.json()) as any
  return js.data.resultset
}
