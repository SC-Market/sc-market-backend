import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { fetchRSIProfileDirect } from "../../../../clients/rsi/scraper.js"
import { fetchRSIProfileCommunityHub } from "../../../../clients/rsi/community_hub.js"
import { fetchRSIProfileSCAPI } from "../../../../clients/scapi/scapi.js"
import logger from "../../../../logger/logger.js"
import { getSpectrumUserIdByHandle } from "../util/spectrum.js"
import { spectrumAPI } from "../../../../clients/spectrum/index.js"

export function get_sentinel(user_id: string) {
  return `[sc-market.space:${user_id.substring(0, 8).toUpperCase()}]`
}

async function fetchProfile(spectrum_id: string) {
  // Try community hub first (preferred source)
  let community
  try {
    community = await fetchRSIProfileCommunityHub(spectrum_id)
  } catch (e) {
    logger.debug("Failed to fetch community hub", e)
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
    } catch (e) {
      logger.debug("Failed to parse community hub data", e)
    }
  }

  // Fallback to SCAPI if community hub fails
  let scapi
  try {
    scapi = await fetchRSIProfileSCAPI(spectrum_id)
  } catch (e) {
    logger.debug("Failed to fetch SCAPI", e)
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
    logger.debug("Malformed SCAPI data", scapi, e)
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

  // Final fallback to direct profile fetch
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
    // Fetch the Spectrum user ID using the new API client
    let spectrum_user_id: string | null = null
    try {
      spectrum_user_id = await getSpectrumUserIdByHandle(profileDetails.handle)
      logger.debug(
        `Fetched Spectrum user ID ${spectrum_user_id} for handle ${profileDetails.handle}`,
      )
    } catch (error) {
      logger.debug(
        `Failed to fetch Spectrum user ID for handle ${profileDetails.handle}: ${error}`,
      )
      // Continue with verification even if Spectrum ID fetch fails
    }

    // Check if this Spectrum user ID is already in use by another account
    if (spectrum_user_id) {
      try {
        const existingUser = await database.getUser({ spectrum_user_id })
        if (existingUser && existingUser.user_id !== user_id) {
          logger.debug(
            `Spectrum user ID ${spectrum_user_id} is already in use by user ${existingUser.user_id}`,
          )
          return {
            success: false,
            error: "This RSI account is already linked to another user",
          }
        }
      } catch (error) {
        // User not found with this spectrum_user_id, which is expected for new verifications
        logger.debug(
          `No existing user found with Spectrum ID ${spectrum_user_id}`,
        )
      }
    }

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
        spectrum_user_id: spectrum_user_id,
        avatar: avatar_resource ? avatar_resource.resource_id : undefined,
      },
    )

    logger.debug(
      `Successfully verified and updated user ${user_id} with RSI handle ${profileDetails.handle} and Spectrum ID ${spectrum_user_id}`,
    )
    return { success: true, error: null }
  }

  return { success: false, error: "Code not found" }
}

/**
 * Fetch a user's profile using their Spectrum ID
 * This uses the new Spectrum API client to get profile information
 * @param spectrum_id - The Spectrum user ID to look up
 * @returns Promise<ProfileDetails | undefined>
 */
async function fetchProfileBySpectrumId(spectrum_id: string) {
  try {
    // Fetch member info using the Spectrum API
    const memberInfo = await spectrumAPI.fetchMemberById(spectrum_id)

    if (memberInfo.success && memberInfo.data?.member) {
      return {
        handle: memberInfo.data.member.nickname,
        display_name: memberInfo.data.member.displayname,
        biography: memberInfo.data.member.signature || "", // Use signature as biography since bio isn't available
        profile_image: memberInfo.data.member.avatar,
      }
    } else {
      logger.debug(
        `Failed to fetch Spectrum member info for ID ${spectrum_id}: ${memberInfo.msg || "Unknown error"}`,
      )
      return undefined
    }
  } catch (error) {
    logger.debug(
      `Error fetching profile by Spectrum ID ${spectrum_id}: ${error}`,
    )
    return undefined
  }
}

/**
 * Sync a user's RSI handle from their Spectrum profile
 * This function looks up the user's current handle and updates their profile
 * @param user_id - The user ID to sync
 * @returns Promise<{success: boolean, error: string | null}>
 */
export async function syncRSIHandle(user_id: string) {
  try {
    // Get the user's current information
    const user = await database.getUser({ user_id })
    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Check if user has a Spectrum ID
    if (!user.spectrum_user_id) {
      return { success: false, error: "User does not have a Spectrum ID" }
    }

    // Check if user is already verified
    if (!user.rsi_confirmed) {
      return { success: false, error: "User is not currently verified" }
    }

    // Fetch the user's current profile using their Spectrum ID
    const profileDetails = await fetchProfileBySpectrumId(user.spectrum_user_id)
    if (!profileDetails) {
      return {
        success: false,
        error: "Could not fetch current profile information",
      }
    }

    // No need to check for sentinel since we're just updating their handle
    // to match what's currently in their Spectrum profile

    // Check if the handle has changed
    if (profileDetails.handle !== user.username) {
      logger.info(
        `User ${user_id} handle changed from ${user.username} to ${profileDetails.handle}`,
      )
    }

    // Handle avatar update if profile image changed
    let avatar_resource = undefined
    if (profileDetails.profile_image) {
      try {
        avatar_resource = await cdn.createExternalResource(
          profileDetails.profile_image.replace(
            "https://robertsspaceindustries.comhttps://cdn.robertsspaceindustries.com",
            "https://cdn.robertsspaceindustries.com",
          ),
          user_id + "_avatar",
        )
      } catch (error) {
        logger.debug(`Failed to update avatar for user ${user_id}: ${error}`)
        // Continue without avatar update
      }
    }

    // Update user profile with current information
    await database.updateUser(
      { user_id },
      {
        username: profileDetails.handle,
        display_name: profileDetails.display_name,
        rsi_confirmed: true,
        avatar: avatar_resource ? avatar_resource.resource_id : undefined,
      },
    )

    logger.debug(
      `Successfully synced RSI handle for user ${user_id} to ${profileDetails.handle}`,
    )
    return { success: true, error: null }
  } catch (error) {
    logger.error(`Error syncing RSI handle for user ${user_id}: ${error}`)
    return { success: false, error: "Internal error during handle sync" }
  }
}
