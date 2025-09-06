import { cdn } from "../../../../clients/cdn/cdn.js"
import { database } from "../../../../clients/database/knex-db.js"
import { get_sentinel } from "../profiles/helpers.js"
import { fetchRSIOrgSCAPI } from "../../../../clients/scapi/scapi.js"
import { User } from "../api-models.js"

export async function createContractor(options: {
  owner_id: string
  description: string
  spectrum_id: string
  name: string
  logo: string
  banner: string
  member_count: number
  locale: string
}) {
  const {
    owner_id,
    description,
    spectrum_id,
    name,
    logo,
    banner,
    member_count,
    locale,
  } = options
  let avatar_resource = undefined
  if (logo) {
    try {
      avatar_resource = await cdn.createExternalResource(
        logo.replace(
          "https://robertsspaceindustries.comhttps://cdn.robertsspaceindustries.com",
          "https://cdn.robertsspaceindustries.com",
        ),
        spectrum_id + "_org_avatar",
      )
    } catch {
      avatar_resource = undefined
    }
  }

  let banner_resource = undefined
  if (banner) {
    try {
      banner_resource = await cdn.createExternalResource(
        banner.replace(
          "https://robertsspaceindustries.comhttps://cdn.robertsspaceindustries.com",
          "https://cdn.robertsspaceindustries.com",
        ),
        spectrum_id + "_org_banner",
      )
    } catch {
      banner_resource = undefined
    }
  }

  const contractor = await database.insertContractor({
    spectrum_id: spectrum_id.toUpperCase(),
    name: name || spectrum_id.toUpperCase(),
    kind: "contractor",
    size: member_count,
    avatar: avatar_resource ? avatar_resource.resource_id : undefined,
    description: description.trim(),
    banner: banner_resource ? banner_resource.resource_id : undefined,
    locale,
  })

  await database.insertContractorMember(
    contractor.contractor_id,
    owner_id,
    "owner",
  )
  const owner_role = await database.insertContractorRole({
    contractor_id: contractor.contractor_id,
    position: 0,
    manage_roles: true,
    manage_orders: true,
    kick_members: true,
    manage_invites: true,
    manage_org_details: true,
    manage_stock: true,
    manage_market: true,
    manage_webhooks: true,
    manage_recruiting: true,
    manage_blocklist: true,
    name: "Owner",
  })

  const default_role = await database.insertContractorRole({
    contractor_id: contractor.contractor_id,
    position: 10,
    manage_roles: false,
    manage_orders: false,
    kick_members: false,
    manage_invites: false,
    manage_org_details: false,
    manage_stock: false,
    manage_market: false,
    manage_webhooks: false,
    manage_recruiting: false,
    manage_blocklist: false,
    name: "Member",
  })

  await database.insertContractorRole({
    contractor_id: contractor.contractor_id,
    position: 1,
    manage_roles: true,
    manage_orders: true,
    kick_members: true,
    manage_invites: true,
    manage_org_details: true,
    manage_stock: true,
    manage_market: true,
    manage_webhooks: true,
    manage_recruiting: true,
    manage_blocklist: true,
    name: "Admin",
  })
  await database.insertContractorMemberRole({
    user_id: owner_id,
    role_id: owner_role[0].role_id,
  })
  await database.insertContractorMemberRole({
    user_id: owner_id,
    role_id: default_role[0].role_id,
  })
  await database.updateContractor(
    {
      contractor_id: contractor.contractor_id,
    },
    {
      default_role: default_role[0].role_id,
      owner_role: owner_role[0].role_id,
    },
  )
}

export async function authorizeContractor(
  spectrum_id: string,
  user: User,
  override = false,
) {
  const orgDetails = await fetchRSIOrgSCAPI(spectrum_id)

  const choices = [
    orgDetails.data?.headline?.plaintext || "",
    orgDetails.data?.manifesto?.plaintext || "",
    orgDetails.data?.charter?.plaintext || "",
    orgDetails.data?.history?.plaintext || "",
  ]

  const sentinel = get_sentinel(user.user_id)

  if (override || choices.find((c) => c.includes(sentinel))) {
    await createContractor({
      owner_id: user.user_id,
      spectrum_id,
      description: choices[0].trim(),
      name: orgDetails?.data?.name || spectrum_id,
      banner: orgDetails?.data?.banner,
      logo: orgDetails?.data?.logo,
      member_count: orgDetails?.data?.members || 1,
      locale: user.locale,
    })
    return true
  }

  return false
}
