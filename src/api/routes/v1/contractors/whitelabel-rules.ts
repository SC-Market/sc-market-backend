/**
 * "Require org membership" only means something on an Internal (login
 * required) site: a Public site lets anyone browse. Store it off for Public
 * so the saved config matches what visitors get.
 */
export function effectiveRequireMembership(
  focusMode: string,
  requireMembership: boolean,
): boolean {
  return focusMode === "internal" && !!requireMembership
}
