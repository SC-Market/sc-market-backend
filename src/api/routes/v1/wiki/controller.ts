import { RequestHandler } from "express"
import logger from "../../../../logger/logger.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

export const wiki_get_imagesearch_query: RequestHandler = async function (
  req,
  res,
) {
  try {
    const query = req.params["query"]

    if (query.length < 3) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Query must be at least 3 characters long",
          ),
        )
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

    res.json(createResponse(result))
  } catch (e) {
    logger.error("Error in wiki image search", { error: e })
    res.json(createResponse({ pages: [] }))
  }
}

export const wiki_get_itemsearch_query: RequestHandler = async function (
  req,
  res,
) {
  const query = req.params["query"]

  if (query.length < 3) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Query must be at least 3 characters long",
        ),
      )
    return
  }

  const result = await wikiItemSearch(query)
  res.json(createResponse(result))
}
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
