import express from "express"
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

export const commodityRouter = express.Router()

commodityRouter.get("", async function (req, res) {
  const route = await getCommodities()
  res.status(200).json(route)
})
