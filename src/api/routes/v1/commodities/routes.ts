import express from "express"

import { commodity_get_root } from "./controller.js"

import { commodity_get_root_spec } from "./openapi.js"

export const commodityRouter = express.Router()

commodityRouter.get("", commodity_get_root_spec, commodity_get_root)
