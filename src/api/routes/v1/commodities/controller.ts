import { RequestHandler } from "express"
import { env } from "../../../../config/env.js"

async function getCommodities() {
  const resp = await fetch("https://api.uexcorp.space/commodities/", {
    headers: {
      api_key: env.UEXCORP_API_KEY!,
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9,fr;q=0.8",
      "content-type": "application/json; charset=UTF-8",
    },
  })
  return await resp.json()
}

export const commodity_get_root: RequestHandler = async function (req, res) {
  const route = await getCommodities()
  res.json(route)
}
