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
      contractors.map(async (s) => ({
        ...(await database.getMinimalContractor({
          spectrum_id: s.spectrum_id,
        })),
        role: s.role,
      })),
    ),
    rating: await getUserRating(user.user_id),
    discord_profile: discord_profile
      ? {
          username: discord_profile.username,
          discriminator: discord_profile.discriminator,
          id: discord_profile.id,
        }
      : undefined,
    market_order_template: user.market_order_template,
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
