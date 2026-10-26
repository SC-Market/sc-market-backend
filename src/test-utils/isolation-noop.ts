/**
 * For unit tests whose knex is a hand-rolled mock: the test-account realm
 * checks (services/test-accounts/isolation.ts) query accounts/contractors/
 * shops, which those mocks don't model. Every party in such a test is a real
 * account, so the checks are no-ops:
 *
 *   vi.mock("<rel>/services/test-accounts/isolation.js", async (importOriginal) => ({
 *     ...(await importOriginal<object>()),
 *     ...(await import("<rel>/test-utils/isolation-noop.js")).allPartiesReal,
 *   }))
 *
 * The rules themselves are tested against Postgres in
 * src/services/test-accounts/__tests__/test-accounts.pg.test.ts.
 */
export const allPartiesReal = {
  realmsOf: async () => new Set([false]),
  assertSameRealm: async () => {},
  involvesTestParty: async () => false,
  isTestUserId: async () => false,
  rejectMixedRealm: async () => false,
  deliverableRecipients: async (ids: string[]) => ids,
  recipientsAllowedFor: async (_actorIsTest: boolean, ids: string[]) => ids,
}
