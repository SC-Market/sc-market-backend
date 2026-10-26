import { DBContractorRole } from "../../../../clients/database/db-models.js"

/** A member's rank: their best (lowest) role position. No roles ranks last. */
export function memberRank(roles: Pick<DBContractorRole, "position">[]): number {
  return roles.length ? Math.min(...roles.map((r) => r.position)) : Infinity
}

/**
 * Whether `actor` may kick `target` from an org (kick_members is checked
 * separately). Nobody can kick themselves (that's Leave). The owner can kick
 * anyone else. Everyone else must rank strictly above the target: members of
 * equal rank can't kick each other.
 */
export function canKickMember(args: {
  actorId: string
  targetId: string
  actorIsOwner: boolean
  actorRoles: Pick<DBContractorRole, "position">[]
  targetRoles: Pick<DBContractorRole, "position">[]
}): boolean {
  if (args.actorId === args.targetId) return false
  if (args.actorIsOwner) return true
  return memberRank(args.actorRoles) < memberRank(args.targetRoles)
}
