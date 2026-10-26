export type FactorType = "totp" | "email" | "webauthn"

export interface FactorRow {
  id: string
  user_id: string
  type: FactorType
  label: string
  secret_ciphertext: string | null
  secret_key_id: string | null
  public_data: Record<string, unknown>
  last_used_counter: string | number | null
  failed_attempts: number
  lockout_count: number
  locked_until: Date | null
  created_at: Date
  confirmed_at: Date | null
  last_used_at: Date | null
}

export interface VerifyResult {
  ok: boolean
  /** Time step (TOTP) or signature counter (WebAuthn) to persist for replay protection. */
  counter?: number
}

export interface UserRef {
  user_id: string
  username: string
}

/** Error codes returned to clients (never carry the submitted input). */
export const MfaErrorCode = {
  Required: "MFA_REQUIRED",
  EnrollmentRequired: "MFA_ENROLLMENT_REQUIRED",
  StepUpRequired: "MFA_STEP_UP_REQUIRED",
  InvalidCode: "MFA_INVALID_CODE",
  Locked: "MFA_LOCKED",
  NotConfigured: "MFA_NOT_CONFIGURED",
  SessionUnsupported: "MFA_SESSION_UNSUPPORTED",
} as const
export type MfaErrorCode = (typeof MfaErrorCode)[keyof typeof MfaErrorCode]

/** Audit events (user_mfa_events.event). */
export type MfaEvent =
  | "enroll_started"
  | "enroll_confirmed"
  | "verify_ok"
  | "verify_failed"
  | "stepup_ok"
  | "recovery_used"
  | "codes_regenerated"
  | "factor_removed"
  | "locked"
  | "reset_by_admin"
  | "break_glass_reset"
  | "admin_token_created"
