# Admin two-factor authentication: operations and break-glass

## How it works

- Site admins must verify with an authenticator app (TOTP) to use admin
  features. A verification lasts 24 hours per browser session. Sensitive
  actions (feature flags, premium domains, spectrum migration, unlinking
  users, moderation decisions, express verification, expiring all listings,
  admin/moderation API tokens, MFA changes) need a fresh code within the last
  10 minutes ("step-up").
- Without a verified session the site works normally; only admin power is
  held back. The admin pages prompt for setup or a code.
- Normal users are not affected.
- Code: `src/services/mfa/`, `src/api/util/site-admin-policy.ts`,
  `src/api/util/step-up.ts`, `src/api/routes/v2/mfa/MfaController.ts`.
  Design: `admin-2fa-design.md` (owner decisions in section 11).

## Configuration (Lightsail container env)

Env is owned by the live Lightsail deployment, not CDK. Set it with
sc-market-cdk's `scripts/lightsail-env.sh` from an operator machine:

```bash
# mfa.env (keep out of git):
#   MFA_ENC_KEYS={"k2026":"<output of: openssl rand -base64 32>"}
#   MFA_ENC_ACTIVE_KID=k2026
scripts/lightsail-env.sh set sc-market backend MFA_ENC_KEYS MFA_ENC_ACTIVE_KID --from-file ./mfa.env          # dry run
scripts/lightsail-env.sh set sc-market backend MFA_ENC_KEYS MFA_ENC_ACTIVE_KID --from-file ./mfa.env --apply --wait
```

The moment the key is live, admin features need two-factor: enroll right
away from Settings (the admin pages also prompt).

| Variable | Value |
|---|---|
| `MFA_ENC_KEYS` | JSON map of key id to 32 random bytes in base64, e.g. `{"k2026":"<openssl rand -base64 32>"}` |
| `MFA_ENC_ACTIVE_KID` | The key id new secrets are sealed with. Optional with a single key. |
| `ADMIN_MFA_ENFORCE` | `true` / `false`. Unset means on in production. This is the rollback switch. |

- Keep an offline copy of `MFA_ENC_KEYS` in the password manager. Losing it
  means every admin re-enrolls (recoverable, not data loss).
- If enforcement is on but the key is missing or invalid, the backend logs
  `[mfa] ADMIN_MFA_ENFORCE is on but ...` at startup and does **not** enforce
  (admins keep pre-MFA access) until the key is set. `GET /api/v2/auth/mfa/status`
  reports `enforcement: "unconfigured"`.
- Rollback: `scripts/lightsail-env.sh set sc-market backend ADMIN_MFA_ENFORCE`
  with value `false` (`--apply --wait`), or revert the code. Enforcement off removes masking, step-up and the admin
  token rules; enrolled factors stay.

## Enrolling

1. Log in on https://sc-market.space (not a white-label domain).
2. Open Settings, "Two-factor authentication", and follow the steps: scan the
   QR code (or type the key), enter the 6-digit code, save the 10 recovery
   codes somewhere safe. They are shown once.
3. Logged in with an old (pre-JWT) session? The page says so: log out and in.

## Lost authenticator

- Use a recovery code wherever a code is asked for. Each works once. Then
  regenerate codes or set up a new authenticator in Settings.
- Another admin can reset you: `POST /api/v2/admin/mfa/users/{username}/reset`
  (needs their step-up and a reason).
- Otherwise, break-glass.

## Break-glass reset

Who: only the owner, who is the only person with production database access.
No second person is required (owner decision).

1. Confirm identity first if the request did not come from you: a Discord DM
   from the account's linked Discord user, plus a check of the RSI profile
   linked to the account.
2. From an operator machine with the production database credentials in the
   environment (`DATABASE_PASS` JSON or `DATABASE_HOST`/`DATABASE_USER`/...,
   as for the backend), in a checkout of this repo:

   ```bash
   npx tsx scripts/mfa-break-glass.ts --user <username|user_id> --reason "<why>" --dry-run
   npx tsx scripts/mfa-break-glass.ts --user <username|user_id> --reason "<why>"
   ```

   The dry run prints what will be removed. The real run, in one transaction,
   deletes the user's factors and recovery codes, bumps
   `accounts.mfa_changed_at`, revokes their refresh tokens, deletes their
   legacy `login_sessions` and revokes their admin/moderation API tokens. It
   writes `break_glass_reset` to `user_mfa_events` (operator and host in
   metadata) and `mfa_break_glass_reset` to `audit_logs`.
3. The user logs in again and re-enrolls from Settings.
4. Afterwards: review `user_mfa_events` and `audit_logs` for the account
   around the incident, and re-issue any admin API tokens that were revoked.

## Key rotation

1. Add the new key id to `MFA_ENC_KEYS`, set `MFA_ENC_ACTIVE_KID` to it
   (`lightsail-env.sh set ... --apply`). New enrollments use the new key; old secrets still open with the
   old key.
2. Re-enroll (or reset) factors sealed with the old key: `SELECT user_id FROM
   user_mfa_factors WHERE secret_key_id = '<old kid>'`.
3. Remove the old key id the same way.

Recovery codes are scrypt hashes and do not depend on the key.
