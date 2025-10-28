import express from "express"

import {
  wiki_get_imagesearch_query,
  wiki_get_itemsearch_query,
} from "./controller.js"

import {
  wiki_get_imagesearch_query_spec,
  wiki_get_itemsearch_query_spec,
} from "./openapi.js"

export const wikiRouter = express.Router()

// OpenAPI Schema Definitions

wikiRouter.get(
  "/imagesearch/:query",
  wiki_get_imagesearch_query_spec,
  wiki_get_imagesearch_query,
)

wikiRouter.get(
  "/itemsearch/:query",
  wiki_get_itemsearch_query_spec,
  wiki_get_itemsearch_query,
)
