import { Request, Response, NextFunction } from "express"
import passport from "passport"
import { User } from "./v1/api-models.js"
import { userAuthorized } from "../middleware/auth.js"
import { env } from "../../config/env.js"
import {
  validateRedirectPath,
  createSignedStateToken,
  verifySignedStateToken,
} from "../util/oauth-state.js"
import {
  mapErrorCodeToFrontend,
  CitizenIDErrorCodes,
  AuthErrorCodes,
} from "../util/auth-helpers.js"
import logger from "../../logger/logger.js"
import {
  isJWTAuthEnabled,
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
  validateRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  revokeAllUserRefreshTokens,
  getUserSessions,
  revokeSessionById,
  verifyAccessToken,
} from "../util/jwt.js"
import * as profileDb from "./v1/profiles/database.js"

/**
 * Setup authentication routes
 */
export function setupAuthRoutes(app: any, frontendUrl: URL): void {
  /**
   * Complete login: issue JWT cookies (if enabled) or save session, then redirect.
   */
  async function completeLogin(
    req: Request,
    res: Response,
    user: User,
    redirectUrl: string,
    provider: string,
  ): Promise<void> {
    if (isJWTAuthEnabled()) {
      const accessToken = generateAccessToken(user)
      const refreshToken = generateRefreshToken()
      await saveRefreshToken(user.user_id, refreshToken, req)
      setAuthCookies(res, accessToken, refreshToken)
      logger.info(`[Auth] ${provider} JWT login successful`, { userId: user.user_id })
      res.redirect(redirectUrl)
    } else {
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          logger.error(`[Auth] ${provider} login error`, { error: loginErr })
          res.redirect(redirectUrl)
          return
        }
        // Regenerate session after login to prevent fixation
        req.session.regenerate((regenErr) => {
          if (regenErr) {
            logger.error(`[Auth] ${provider} session regenerate error`, { error: regenErr })
          }
          // Re-login after regenerate (regenerate clears passport data)
          req.logIn(user, (reLoginErr) => {
            if (reLoginErr) {
              logger.error(`[Auth] ${provider} re-login error`, { error: reLoginErr })
            }
            logger.info(`[Auth] ${provider} session login successful`, {
              userId: user.user_id,
              sessionID: req.sessionID,
            })
            req.session.save((saveErr) => {
              if (saveErr) {
                logger.error(`[Auth] ${provider} session save error`, { error: saveErr })
              }
              res.redirect(redirectUrl)
            })
          })
        })
      })
    }
  }
  // Resolve the base URL for post-auth redirects.
  // If origin is a known custom domain, redirect there; otherwise use frontendUrl.
  function getRedirectBase(origin: string): URL {
    if (!origin) return frontendUrl
    try {
      const url = new URL(origin)
      // Only allow https custom domains (or http in dev)
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url
      }
    } catch { /* invalid origin */ }
    return frontendUrl
  }

  // Discord authentication routes
  app.get(
    "/auth/discord",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as { path?: string; action?: string; origin?: string }
      const path = query.path || ""
      const action = query.action === "signup" ? "signup" : "signin"
      const origin = query.origin || ""

      // Validate the redirect path
      if (!validateRedirectPath(path)) {
        return res.status(400).json({ error: "Invalid redirect path" })
      }

      // Store action in session for use in strategy callback
      if (!req.session) {
        return res.status(500).json({ error: "Session not available" })
      }
      ;(req.session as any).discord_auth_action = action

      // Create a signed state token that includes both CSRF protection and the redirect path
      if (!env.SESSION_SECRET) {
        throw Error("Session secret must be set")
      }

      const sessionSecret = env.SESSION_SECRET
      let signedStateToken: string
      try {
        signedStateToken = createSignedStateToken(path, sessionSecret, action, origin)
      } catch (error) {
        return res.status(400).json({ error: "Failed to create state token" })
      }

      // Save session before redirecting to Discord OAuth
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error("Failed to save session before Discord OAuth", { error: saveErr })
        }
        return passport.authenticate("discord", {
          session: true,
          state: signedStateToken,
        })(req, res, next)
      })
    },
  )

  app.get(
    "/auth/discord/callback",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as { state?: string }
      const receivedState = query.state

      // Verify the signed state token and extract the redirect path and action
      const sessionSecret = env.SESSION_SECRET || "set this var"
      const verified = verifySignedStateToken(
        receivedState || "",
        sessionSecret,
      )

      if (!verified) {
        // Invalid or missing state - potential CSRF attack or tampering
        logger.error("[Auth] State verification failed", {
          hasState: !!receivedState,
          stateLength: receivedState?.length,
          statePreview: receivedState ? receivedState.substring(0, 50) + "..." : "none",
        })
        // Redirect to frontend home page on failure
        return res.redirect(frontendUrl.toString())
      }

      const { path: redirectPath, action } = verified
      logger.info("[Auth] State verified", {
        redirectPath,
        action,
        origin: verified.origin,
      })

      // Resolve redirect base from origin in state
      const redirectBase = getRedirectBase(verified.origin)

      // Ensure action is stored in session
      if (req.session) {
        ;(req.session as any).discord_auth_action = action
      }

      // State is valid, proceed with authentication
      return passport.authenticate(
        "discord",
        {
        session: true,
          failWithError: true,
        },
        async (err: any, user: User | false, info: any) => {
          if (err) {
            logger.error("[Auth] Error", {
              error: err,
              errorMessage: err?.message,
              errorCode: err?.code,
              hasUser: !!user,
              info,
            })
            const errorCode = mapErrorCodeToFrontend(err.code)

            // Build redirect URL with error
            const redirectTo = new URL("/", redirectBase)
            redirectTo.searchParams.set("error", errorCode)
            if (err.message && err.message !== errorCode) {
              redirectTo.searchParams.set("error_description", err.message)
            }
            return res.redirect(redirectTo.toString())
          }

          if (!user) {
            logger.error("[Auth] No user returned", {
              hasErr: !!err,
              err,
              user,
              info,
            })
            const redirectTo = new URL("/", redirectBase)
            redirectTo.searchParams.set(
              "error",
              AuthErrorCodes.ACCOUNT_NOT_FOUND,
            )
            return res.redirect(redirectTo.toString())
          }

          const successRedirect = new URL(redirectPath, redirectBase).toString()
          await completeLogin(req, res, user as User, successRedirect, "Discord")
        },
      )(req, res, next)
    },
  )

  // Citizen ID authentication routes
  app.get(
    "/auth/citizenid",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as { path?: string; action?: string; origin?: string }
      const path = query.path || "/market"
      const action = query.action === "signup" ? "signup" : "signin"

      // Validate the redirect path
      if (!validateRedirectPath(path)) {
        return res.status(400).json({ error: "Invalid redirect path" })
      }

      // Store redirect info in a signed cookie (works without sessions)
      const sessionSecret = env.SESSION_SECRET || "set this var"
      const stateToken = createSignedStateToken(path, sessionSecret, action, query.origin || "")
      const prod = app.get("env") === "production"
      res.cookie("scmarket.cidstate", stateToken, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? ("none" as const) : ("lax" as const),
        path: "/auth/citizenid",
        maxAge: 10 * 60 * 1000, // 10 min — enough for OAuth round-trip
      })

      // Also store action in session for the verify callback (reads citizenid_auth_action)
      if (req.session) {
        ;(req.session as any).citizenid_auth_action = action
      }

      return passport.authenticate("citizenid", {
        session: true,
      })(req, res, next)
    },
  )

  // Linking route (for existing users)
  app.get(
    "/auth/citizenid/link",
    userAuthorized,
    async (req: Request, res: Response, next: NextFunction) => {
      const sessionSecret = env.SESSION_SECRET || "set this var"
      const stateToken = createSignedStateToken("/settings", sessionSecret, "signin", "")
      const prod = app.get("env") === "production"
      res.cookie("scmarket.cidstate", stateToken, {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? ("none" as const) : ("lax" as const),
        path: "/auth/citizenid",
        maxAge: 10 * 60 * 1000,
      })

      return passport.authenticate("citizenid-link", {
        session: true,
      })(req, res, next)
    },
  )

  // Login callback
  app.get(
    "/auth/citizenid/callback",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as {
        state?: string
        error?: string
        error_description?: string
        error_uri?: string
        [key: string]: string | undefined
      }

      // Recover redirect info from signed cookie (session-free)
      const sessionSecret = env.SESSION_SECRET || "set this var"
      const cidState = req.cookies?.["scmarket.cidstate"]
      const verified = cidState ? verifySignedStateToken(cidState, sessionSecret) : null
      const redirectPath = verified?.path || (req.session as any)?.citizenid_redirect_path || "/market"
      const citizenidOrigin = verified?.origin || (req.session as any)?.citizenid_origin || ""

      // Clear cookie and session data
      const prod = app.get("env") === "production"
      res.clearCookie("scmarket.cidstate", { path: "/auth/citizenid", httpOnly: true, secure: prod, sameSite: prod ? ("none" as const) : ("lax" as const) })
      if (req.session) {
        delete (req.session as any).citizenid_redirect_path
        delete (req.session as any).citizenid_origin
      }

      const redirectBase = getRedirectBase(citizenidOrigin)

      // Check for OAuth errors
      if (query.error) {
        const errorCode = mapErrorCodeToFrontend(query.error)
        const redirectTo = new URL("/", redirectBase)
        redirectTo.searchParams.set("error", errorCode)
        if (query.error_description) {
          redirectTo.searchParams.set("error_description", query.error_description)
        }
        return res.redirect(redirectTo.toString())
      }

      return passport.authenticate(
        "citizenid",
        {
          session: true,
          failWithError: true,
        },
        async (err: any, user: User | false, info: any) => {
          if (err) {
            logger.error("[CitizenID login callback] Error", {
              error: err,
              errorMessage: err?.message,
              errorCode: err?.code,
              hasUser: !!user,
              info,
            })
            logger.error("[Auth] Citizen ID login error", { error: err })
            const errorCode = mapErrorCodeToFrontend(err.code)

            // If username is taken or account exists with different provider,
            // redirect to login with existing method, then to /settings to link
            if (
              errorCode === CitizenIDErrorCodes.USERNAME_TAKEN ||
              errorCode === CitizenIDErrorCodes.ALREADY_LINKED ||
              errorCode === AuthErrorCodes.ACCOUNT_NOT_FOUND
            ) {
              const backendUrl = new URL(
                env.BACKEND_URL || "http://localhost:7000",
              )
              const discordLoginUrl = new URL("/auth/discord", backendUrl)
              discordLoginUrl.searchParams.set("path", "/settings")
              if (citizenidOrigin) {
                discordLoginUrl.searchParams.set("origin", citizenidOrigin)
              }
              return res.redirect(discordLoginUrl.toString())
            }

            const redirectTo = new URL("/", redirectBase)
            redirectTo.searchParams.set("error", errorCode)
            if (err.message && err.message !== errorCode) {
              redirectTo.searchParams.set("error_description", err.message)
            }
            const errorWithSpectrumIds = err as any
            if (errorWithSpectrumIds.accountSpectrumId) {
              redirectTo.searchParams.set(
                "account_spectrum_id",
                errorWithSpectrumIds.accountSpectrumId,
              )
            }
            if (errorWithSpectrumIds.citizenIDSpectrumId) {
              redirectTo.searchParams.set(
                "citizenid_spectrum_id",
                errorWithSpectrumIds.citizenIDSpectrumId,
              )
            }
            return res.redirect(redirectTo.toString())
          }

          if (!user) {
            logger.error("[CitizenID login callback] No user returned", {
              hasErr: !!err,
              err,
              user,
              info,
            })
            logger.error("Citizen ID login: No user returned", {
              err,
              user,
              info,
            })
            const redirectTo = new URL("/", redirectBase)
            redirectTo.searchParams.set(
              "error",
              CitizenIDErrorCodes.AUTH_FAILED,
            )
            return res.redirect(redirectTo.toString())
          }

          const successRedirect = new URL(redirectPath, redirectBase).toString()
          await completeLogin(req, res, user as User, successRedirect, "CitizenID")
        },
      )(req, res, next)
    },
  )

  // Linking callback
  app.get(
    "/auth/citizenid/link/callback",
    userAuthorized,
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as {
        state?: string
        error?: string
        error_description?: string
        error_uri?: string
        [key: string]: string | undefined
      }

      // Clear signed cookie
      const prod = app.get("env") === "production"
      res.clearCookie("scmarket.cidstate", { path: "/auth/citizenid", httpOnly: true, secure: prod, sameSite: prod ? ("none" as const) : ("lax" as const) })

      // Clear redirect path from session (legacy cleanup)
      if (req.session) {
        delete (req.session as any).citizenid_redirect_path
      }

      // Check for OAuth errors
      if (query.error) {
        const errorCode = mapErrorCodeToFrontend(query.error)
        const redirectTo = new URL("/settings", frontendUrl)
        redirectTo.searchParams.set("error", errorCode)
        if (query.error_description) {
          redirectTo.searchParams.set("error_description", query.error_description)
        }
        return res.redirect(redirectTo.toString())
      }

      return passport.authenticate(
        "citizenid-link",
        {
          session: true,
          failWithError: true,
        },
        async (err: any, user: User | false, info: any) => {
          if (err) {
            logger.error("[CitizenID link callback] Error", {
              error: err,
              errorMessage: err?.message,
              errorCode: err?.code,
              hasUser: !!user,
              info,
            })
            logger.error("Citizen ID linking error", { error: err })
            const errorCode = mapErrorCodeToFrontend(err.code)
            const redirectTo = new URL("/settings", frontendUrl)
            redirectTo.searchParams.set("error", errorCode)
            if (err.message && err.message !== errorCode) {
              redirectTo.searchParams.set("error_description", err.message)
            }
            const errorWithUsernames = err as any
            if (errorWithUsernames.accountUsername) {
              redirectTo.searchParams.set(
                "account_username",
                errorWithUsernames.accountUsername,
              )
            }
            if (errorWithUsernames.citizenIDUsername) {
              redirectTo.searchParams.set(
                "citizenid_username",
                errorWithUsernames.citizenIDUsername,
              )
            }
            return res.redirect(redirectTo.toString())
          }

          if (!user) {
            logger.error("[CitizenID link callback] No user returned", {
              hasErr: !!err,
              err,
              user,
              info,
            })
            logger.error("Citizen ID linking: No user returned", {
              err,
              user,
              info,
            })
            const redirectTo = new URL("/settings", frontendUrl)
            redirectTo.searchParams.set(
              "error",
              CitizenIDErrorCodes.AUTH_FAILED,
            )
            return res.redirect(redirectTo.toString())
          }

          const successRedirect = new URL("/settings", frontendUrl).toString()
          await completeLogin(req, res, user as User, successRedirect, "CitizenID-link")
        },
      )(req, res, next)
    },
  )

  // Logout route - POST only
  // Note: This route works for all authenticated users regardless of verification status
  // No authentication or verification middleware is applied - logout should always be accessible
  app.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
    // Revoke JWT refresh token if present
    const rawRefresh = getRefreshTokenFromRequest(req)
    if (rawRefresh) {
      await revokeRefreshToken(rawRefresh).catch(() => {})
    }
    clearAuthCookies(res)

    // Also clear session auth (for backwards compat / dual-mode)
    req.logout((err) => {
      if (err) {
        logger.error("Error during Passport logout", { error: err })
      }

      if (req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            logger.error("Error destroying session on logout", { error: destroyErr })
          }
          const isProduction = app.get("env") === "production"
          res.clearCookie("scmarket.sid", {
            path: "/",
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? ("none" as const) : ("lax" as const),
          })
          res.json({ success: true, message: "Logged out successfully" })
        })
      } else {
        res.json({ success: true, message: "Logged out successfully" })
      }
    })
  })

  // ── JWT Auth Endpoints ─────────────────────────────────────────────────

  // Refresh access token using refresh token cookie
  // Mounted at both paths for backwards compat (old cookies have path=/api/auth)
  const refreshHandler = async (req: Request, res: Response) => {
    if (!isJWTAuthEnabled()) {
      return res.status(404).json({ error: "JWT auth not enabled" })
    }

    const rawRefresh = getRefreshTokenFromRequest(req)
    if (!rawRefresh) {
      logger.warn("[Auth] Refresh attempt with no refresh cookie", {
        cookies: Object.keys(req.cookies || {}),
        hasAccessCookie: !!req.cookies?.["scmarket.access"],
      })
      return res.status(401).json({ error: "No refresh token" })
    }

    // Rotate: revoke old token and issue new one atomically
    const rotation = await rotateRefreshToken(rawRefresh, req)
    if (!rotation) {
      clearAuthCookies(res)
      return res.status(401).json({ error: "Invalid or expired refresh token" })
    }

    try {
      const user = await profileDb.getUser({ user_id: rotation.userId })
      if (user.banned) {
        clearAuthCookies(res)
        return res.status(403).json({ error: "Account suspended" })
      }

      const accessToken = generateAccessToken(user)
      setAuthCookies(res, accessToken, rotation.newRawToken)
      return res.json({ success: true })
    } catch {
      clearAuthCookies(res)
      return res.status(401).json({ error: "User not found" })
    }
  }
  app.post("/api/auth/refresh", refreshHandler)
  app.post("/auth/refresh", refreshHandler) // legacy — remove after transition

  // JWT logout — revoke refresh token + clear cookies
  app.post("/auth/jwt-logout", async (req: Request, res: Response) => {
    const rawRefresh = getRefreshTokenFromRequest(req)
    if (rawRefresh) {
      await revokeRefreshToken(rawRefresh)
    }
    clearAuthCookies(res)
    res.json({ success: true, message: "Logged out successfully" })
  })

  // List active sessions (refresh tokens) for current user
  app.get("/auth/sessions", async (req: Request, res: Response) => {
    // Works with both JWT and session auth
    const userId = (req.user as any)?.user_id
    if (!userId) {
      // Try JWT
      const accessToken = req.cookies?.["scmarket.access"]
      if (accessToken) {
        const payload = verifyAccessToken(accessToken)
        if (payload) {
          const sessions = await getUserSessions(payload.sub)
          return res.json({ data: sessions.map(s => ({
            token_id: s.token_id,
            created_at: s.created_at,
            expires_at: s.expires_at,
            user_agent: s.user_agent,
            ip_address: s.ip_address,
          }))})
        }
      }
      return res.status(401).json({ error: "Unauthenticated" })
    }
    const sessions = await getUserSessions(userId)
    return res.json({ data: sessions.map(s => ({
      token_id: s.token_id,
      created_at: s.created_at,
      expires_at: s.expires_at,
      user_agent: s.user_agent,
      ip_address: s.ip_address,
    }))})
  })

  // Revoke a specific session
  app.delete("/auth/sessions/:tokenId", async (req: Request, res: Response) => {
    const userId = (req.user as any)?.user_id
    if (!userId) return res.status(401).json({ error: "Unauthenticated" })
    const revoked = await revokeSessionById(userId, req.params.tokenId)
    if (!revoked) return res.status(404).json({ error: "Session not found" })
    return res.json({ success: true })
  })
}
