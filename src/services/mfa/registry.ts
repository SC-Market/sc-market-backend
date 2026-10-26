/**
 * Factor providers do the factor-specific math (generate/verify). Everything
 * cross-cutting (rate limits, lockout, replay, audit, session elevation)
 * lives in MfaService, so a new factor type is a provider plus a UI component.
 */

import type { FactorRow, FactorType, UserRef, VerifyResult } from "./types.js"

export interface EnrollmentMaterial {
  /** Raw secret to seal into secret_ciphertext (null for factors without one). */
  secret: Buffer | null
  publicData: Record<string, unknown>
  /** Shown to the user once, never stored or logged. */
  display: Record<string, string>
}

export interface FactorProvider {
  type: FactorType
  /** RFC 8176 authentication method reference. */
  amr: string
  beginEnrollment(user: UserRef, label: string): Promise<EnrollmentMaterial>
  /** Verify a response against the factor's secret. Must be constant-time. */
  verify(
    factor: FactorRow,
    secret: Buffer | null,
    input: string,
    epochSeconds: number,
  ): Promise<VerifyResult>
}

const providers = new Map<FactorType, FactorProvider>()

export function registerProvider(provider: FactorProvider): void {
  providers.set(provider.type, provider)
}

export function getProvider(type: string): FactorProvider {
  const provider = providers.get(type as FactorType)
  if (!provider) throw new Error(`No MFA provider registered for "${type}"`)
  return provider
}

export function registeredTypes(): FactorType[] {
  return [...providers.keys()]
}
