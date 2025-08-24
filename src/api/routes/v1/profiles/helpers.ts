import { DBUser } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { getUserRating } from "../util/formatting.js"
import { fetchRSIProfileDirect } from "../../../../clients/rsi/scraper.js"
import winston from "winston"
import { fetchRSIProfileNydoo } from "../../../../clients/nydoo/nydoo.js"
import { fetchRSIProfileCommunityHub } from "../../../../clients/rsi/community_hub.js"
import { fetchRSIProfileSCAPI } from "../../../../clients/scapi/scapi.js"
import logger from "../../../../logger/logger.js"

export function get_sentinel(user_id: string) {
  return `[SCMKT:${user_id.substring(0, 8).toUpperCase()}]`
}

async function fetchProfile(spectrum_id: string) {
  let scapi
  try {
    scapi = await fetchRSIProfileSCAPI(spectrum_id)
  } catch (e) {
    console.log("Failed to fetch SCAPI", e)
    scapi = undefined
  }

  try {
    if (scapi && scapi.data) {
      return {
        handle: scapi.data.profile.handle,
        display_name: scapi.data.profile.display,
        biography: scapi.data.profile.bio || "",
        profile_image: scapi.data.profile.image,
      }
    }
  } catch (e) {
    console.log("Malformed SCAPI data", scapi, e)
  }

  let community
  try {
    community = await fetchRSIProfileCommunityHub(spectrum_id)
  } catch (e) {
    console.log("Failed to fetch community hub", e)
    community = undefined
  }

  if (community) {
    try {
      return {
        handle: community.creator.nickname,
        display_name: community.creator.displayName,
        biography: community.creator.bio,
        profile_image: community.creator.thumbnailUrl,
      }
    } catch (e) {}
  }

  // let nydoo
  // try {
  //   nydoo = await fetchRSIProfileNydoo(spectrum_id)
  // } catch (e) {
  //   console.log("Failed to fetch Nydoo", e)
  //   nydoo = undefined
  // }
  //
  // if (nydoo) {
  //   try {
  //     return {
  //       handle: nydoo.data[0].user_handle,
  //       display_name: nydoo.data[0].user_displayname,
  //       biography: nydoo.data[0].user_biography || "",
  //       profile_image: nydoo.data[0].user_profile_image,
  //     }
  //   } catch (e) {}
  // }
  // logger.error("Malformed Nydoo data", nydoo)

  try {
    return await fetchRSIProfileDirect(spectrum_id)
  } catch (e) {
    logger.error("Failed to fetch direct", e)
    return undefined
  }
}

export async function authorizeProfile(
  username: string,
  user_id: string,
  override = false,
) {
  try {
    const user = await database.getUser({ username })
    if (user.user_id !== user_id) {
      return { success: false, error: "User already registered" }
    }
  } catch {}

  const profileDetails = await fetchProfile(username)

  const sentinel = get_sentinel(user_id)

  if (
    profileDetails &&
    (override ||
      (profileDetails.biography &&
        profileDetails.biography.toUpperCase().includes(sentinel)))
  ) {
    const avatar_url: string | undefined = profileDetails.profile_image

    let avatar_resource = undefined
    if (avatar_url) {
      try {
        avatar_resource = await cdn.createExternalResource(
          avatar_url.replace(
            "https://robertsspaceindustries.comhttps://cdn.robertsspaceindustries.com",
            "https://cdn.robertsspaceindustries.com",
          ),
          user_id + "_avatar",
        )
      } catch {
        avatar_resource = undefined
      }
    }

    await database.updateUser(
      { user_id },
      {
        username: profileDetails.handle,
        display_name: profileDetails.display_name,
        rsi_confirmed: true,
        avatar: avatar_resource ? avatar_resource.resource_id : undefined,
      },
    )

    return { success: true, error: null }
  }

  return { success: false, error: "Code not found" }
}
