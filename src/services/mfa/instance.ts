/**
 * The process-wide MfaService, wired to Postgres. Limiters are built on first
 * use, so importing MFA code (e.g. from populate-user) does not create
 * Postgres rate-limit tables in processes and tests that never verify a code.
 */

import type { RateLimiterConfig } from "../../api/middleware/enhanced-ratelimiting.js"
import { knexMfaRepo } from "./repo.js"
import { MfaService, type Limiter } from "./service.js"

function lazyLimiter(config: RateLimiterConfig): Limiter {
  let limiter: Promise<{ consume(key: string): Promise<unknown> }> | null = null
  return {
    async consume(key) {
      limiter ??= import("../../api/middleware/enhanced-ratelimiting.js").then((m) =>
        m.createRateLimiter(config),
      )
      return (await limiter).consume(key)
    },
  }
}

let instance: MfaService | null = null

export function getMfaService(): MfaService {
  if (!instance) {
    // Dedicated limiters, not the tiered ones (admins get the loosest tier).
    instance = new MfaService({
      repo: knexMfaRepo(),
      verifyLimiter: lazyLimiter({
        points: 20,
        duration: 15 * 60,
        blockDuration: 15 * 60,
        keyPrefix: "scmarket:mfa:verify",
      }),
      enrollLimiter: lazyLimiter({
        points: 5,
        duration: 60 * 60,
        keyPrefix: "scmarket:mfa:enroll",
      }),
    })
  }
  return instance
}

/** For tests. */
export function setMfaService(service: MfaService | null): void {
  instance = service
}
