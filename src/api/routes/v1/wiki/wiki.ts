import express from "express"
import { oapi, Response400, Response500 } from "../openapi.js"

const example_image_resp = {
  pages: [
    {
      id: 34717,
      key: "Animus_Missile_Launcher",
      title: "Animus Missile Launcher",
      excerpt: "Animus Missile Launcher",
      matched_title: null,
      description: "Missile launcher manufactured by Apocalypse Arms",
      thumbnail: {
        mimetype: "image/jpeg",
        size: 3620,
        width: 200,
        height: 103,
        duration: null,
        url: "https://media.starcitizen.tools/thumb/7/7e/Apar_ML_Shot_002_11Dec19-Min.jpg/200px-Apar_ML_Shot_002_11Dec19-Min.jpg",
      },
    },
    {
      id: 42432,
      key: "Animus_Missile_Launcher_Magazine_(3_cap)",
      title: "Animus Missile Launcher Magazine (3 cap)",
      excerpt: "Animus Missile Launcher Magazine (3 cap)",
      matched_title: null,
      description: "Magazine manufactured by Apocalypse Arms",
      thumbnail: {
        mimetype: "image/jpeg",
        size: 5446,
        width: 200,
        height: 132,
        duration: null,
        url: "https://media.starcitizen.tools/thumb/a/a9/Animus_Missile_Launcher_Magazine.jpg/200px-Animus_Missile_Launcher_Magazine.jpg",
      },
    },
  ],
}

async function wikiImageSearch(
  query: string,
): Promise<typeof example_image_resp> {
  const resp = await fetch(
    "https://scw.czen.me/rest.php/v1/search/title?" +
      new URLSearchParams({
        q: query,
        limit: "10",
      }),
  )

  return (await resp.json()) as typeof example_image_resp
}

async function wikiItemSearch(query: string) {
  const resp = await fetch(
    "https://starcitizen.tools/api.php?" +
      new URLSearchParams({
        action: "query",
        prop: "info|pageimages|categories|extracts",
        gsrsearch: query,
        gsrlimit: "50",
        generator: "search",
        format: "json",
        // gcmtitle: 'Category:Personal_Weapons
        // gcmlimit: 'max',
        gexchars: "500",
        inprop: "url",
        cllimit: "max",
        explaintext: "true",
      }),
  )
  return await resp.json()
}

async function wikiImageDetails(url: string) {
  try {
    // https://media.starcitizen.tools/thumb/0/02/Demeco_-_on_grey_background_-_Left.jpg/200px-Demeco_-_on_grey_background_-_Left.jpg
    const filename = url.split("/")[6]

    // https://starcitizen.tools/api.php?action=query&prop=imageinfo|pageimages&iiprop=url&iiurlwidth=200&gsrsearch=FS-9&generator=search

    const resp = await fetch(
      "https://starcitizen.tools/api.php?" +
        new URLSearchParams({
          action: "query",
          prop: "imageinfo",
          titles: `File:${filename}`,
          format: "json",
          iiprop: "url",
          iiurlwidth: "200",
        }),
    )
    return (await resp.json()) as any
  } catch (e) {
    return {}
  }
}

export const wikiRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("WikiImageSearchResult", {
  type: "object",
  properties: {
    id: { type: "number" },
    key: { type: "string" },
    title: { type: "string" },
    excerpt: { type: "string", nullable: true },
    matched_title: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    thumbnail: {
      type: "object",
      nullable: true,
      properties: {
        mimetype: { type: "string" },
        size: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        duration: { type: "number", nullable: true },
        url: { type: "string" }
      }
    },
    images: {
      type: "object",
      nullable: true,
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              imageinfo: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    thumburl: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  required: ["id", "key", "title"]
})

oapi.schema("WikiItemSearchResult", {
  type: "object",
  properties: {
    query: {
      type: "object",
      properties: {
        pages: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              pageid: { type: "number" },
              title: { type: "string" },
              extract: { type: "string", nullable: true },
              thumbnail: {
                type: "object",
                nullable: true,
                properties: {
                  source: { type: "string" }
                }
              },
              categories: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
})

wikiRouter.get("/imagesearch/:query", 
  oapi.validPath({
    summary: "Search wiki images",
    description: "Search for images in the Star Citizen wiki",
    operationId: "searchWikiImages",
    tags: ["Wiki"],
    parameters: [
      {
        name: "query",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 3 },
        description: "Search query (minimum 3 characters)"
      }
    ],
    responses: {
      "200": {
        description: "Image search results retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: { $ref: "#/components/schemas/WikiImageSearchResult" }
            }
          }
        }
      },
      "400": Response400,
      "500": Response500
    }
  }),
  async function (req, res) {
  try {
    const query = req.params["query"]

    if (query.length < 3) {
      res.status(400).json({ error: "Too short" })
      return
    }

    const { pages } = await wikiImageSearch(query)
    const result = await Promise.all(
      pages
        .filter((p) => p.thumbnail)
        .map(async (p) => ({
          ...p,
          images: await wikiImageDetails(p.thumbnail.url),
        })),
    )

    res.json(result)
  } catch (e) {
    console.error(e)
    res.json({ pages: [] })
  }
})

wikiRouter.get("/itemsearch/:query", 
  oapi.validPath({
    summary: "Search wiki items",
    description: "Search for items and pages in the Star Citizen wiki",
    operationId: "searchWikiItems",
    tags: ["Wiki"],
    parameters: [
      {
        name: "query",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 3 },
        description: "Search query (minimum 3 characters)"
      }
    ],
    responses: {
      "200": {
        description: "Item search results retrieved successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WikiItemSearchResult" }
          }
        }
      },
      "400": Response400,
      "500": Response500
    }
  }),
  async function (req, res) {
  const query = req.params["query"]

  if (query.length < 3) {
    res.status(400).json({ error: "Too short" })
    return
  }

  const result = await wikiItemSearch(query)
  res.json(result)
})
