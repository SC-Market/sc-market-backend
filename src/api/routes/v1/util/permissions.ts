import {
  DBContractorRole,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"

export async function has_permission(
  contractor_id: string,
  user_id: string,
  permission_name: keyof DBContractorRole,
) {
  // let roles = await database.getContractorRoles({contractor_id})
  const user = await profileDb.getUser({ user_id })
  if (user.role === "admin") {
    return true
  }

  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)

  for (const role of user_roles) {
    if (role[permission_name]) {
      return true
    }
  }

  return false
}

export async function is_member(contractor_id: string, user_id: string) {
  // let roles = await database.getContractorRoles({contractor_id})
  const members = await contractorDb.getContractorMembers({
    contractor_id,
    user_id,
  })

  return !!members.length
}

export async function outranks(
  contractor_id: string,
  lower_id: string,
  higher_id: string,
) {
  // let roles = await database.getContractorRoles({contractor_id})
  const lower_roles = await contractorDb.getMemberRoles(contractor_id, lower_id)
  const higher_roles = await contractorDb.getMemberRoles(
    contractor_id,
    higher_id,
  )

  const low_min = Math.min(
    ...lower_roles.map((r: DBContractorRole) => r.position),
  )
  const high_min = Math.min(
    ...higher_roles.map((r: DBContractorRole) => r.position),
  )

  return low_min < high_min
}

export async function can_manage_role(
  contractor_id: string,
  role_id: string,
  user_id: string,
) {
  // let roles = await database.getContractorRoles({contractor_id})
  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)
  const role = await contractorDb.getContractorRole({ contractor_id, role_id })

  const user_min = Math.min(
    ...user_roles.map((r: DBContractorRole) => r.position),
  )

  return user_min < role!.position
}

export async function get_min_position(contractor_id: string, user_id: string) {
  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)

  const user_min = Math.min(
    ...user_roles.map((r: DBContractorRole) => r.position),
  )

  return user_min
}
