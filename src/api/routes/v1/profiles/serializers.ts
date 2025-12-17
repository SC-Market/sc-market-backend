import { DBUser } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { getUserRating } from "../util/formatting.js"

export async function serializePublicProfile(
  user: DBUser | User,
  opts: { discord: boolean } = { discord: false },
) {
  const contractors = await database.getUserContractorRoles({
    user_id: user.user_id,
  })
  const settings = await database.getUserSettings(user.user_id)

  let discord_profile
  if (settings.discord_public && opts.discord) {
    discord_profile = await database.discord_profile_cache.fetch(user.user_id)
  }

  return {
    username: user.username,
    display_name: user.display_name,
    avatar: await cdn.getFileLinkResource(user.avatar),
    banner: await cdn.getFileLinkResource(user.banner),
    profile_description: user.profile_description,
    contractors: await Promise.all(
      (() => {
        // Group contractors by spectrum_id to collect all roles with details
        const contractorMap = new Map()

        contractors.forEach((s) => {
          if (!contractorMap.has(s.spectrum_id)) {
            contractorMap.set(s.spectrum_id, {
              spectrum_id: s.spectrum_id,
              name: s.name,
              roles: [],
              role_details: [], // Array of {role_id, role_name, position}
            })
          }
          contractorMap.get(s.spectrum_id).roles.push(s.role_id)
          contractorMap.get(s.spectrum_id).role_details.push({
            role_id: s.role_id,
            role_name: s.role,
            position: s.position,
          })
        })

        return Array.from(contractorMap.values())
      })().map(async (contractor) => ({
        ...contractor,
        ...(await database.getMinimalContractor({
          spectrum_id: contractor.spectrum_id,
        })),
      })),
    ),
    rating: await getUserRating(user.user_id),
    badges: await database.getUserBadges(user.user_id),
    discord_profile: discord_profile
      ? {
          username: discord_profile.username,
          discriminator: discord_profile.discriminator,
          id: discord_profile.id,
        }
      : undefined,
    market_order_template: user.market_order_template,
    rsi_confirmed: user.rsi_confirmed,
  }
}

export async function serializeDetailedProfile(user: User) {
  const contractors = await database.getUserContractors({
    user_id: user.user_id,
  })

  return {
    ...user,
    // balance: (+user.balance!),
    contractors: contractors.map((c) => c.spectrum_id),
    avatar: await cdn.getFileLinkResource(user.avatar),
    banner: await cdn.getFileLinkResource(user.banner),
  }
}
