/**
 * TEST_LOGIN_ENABLED is the kill switch for POST /api/auth/test-login.
 * Only the exact string "true" turns it on; unset, empty or anything else is
 * off and the endpoint answers 404. Read on every request, so changing the
 * container env (a redeploy) takes effect without code changes.
 */
export function isTestLoginEnabled(): boolean {
  return process.env.TEST_LOGIN_ENABLED === "true"
}

/** Strict budgets (owner decision): per submitted username and per IP. */
export const TEST_LOGIN_PER_ACCOUNT_PER_HOUR = 10
export const TEST_LOGIN_PER_IP_PER_HOUR = 30
