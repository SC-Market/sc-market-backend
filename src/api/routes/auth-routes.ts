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

/**
 * Setup authentication routes
 */
export function setupAuthRoutes(app: any, frontendUrl: URL): void {
  // Discord authentication routes
  app.get(
    "/auth/discord",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as { path?: string; action?: string }
      const path = query.path || ""
      const action = query.action === "signup" ? "signup" : "signin"

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
      const sessionSecret = env.SESSION_SECRET || "set this var"
      let signedStateToken: string
      try {
        signedStateToken = createSignedStateToken(path, sessionSecret, action)
      } catch (error) {
        return res.status(400).json({ error: "Failed to create state token" })
      }

      return passport.authenticate("discord", {
        session: true,
        state: signedStateToken,
      })(req, res, next)
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
        // Redirect to frontend home page on failure
        return res.redirect(frontendUrl.toString())
      }

      const { path: redirectPath, action } = verified

      // Ensure action is stored in session (should already be there, but ensure it)
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
        (err: any, user: User | false, info: any) => {
          if (err) {
            logger.error("[Discord callback] Error", {
              error: err,
              errorMessage: err?.message,
              errorCode: err?.code,
              hasUser: !!user,
              info,
            })
            const errorCode = mapErrorCodeToFrontend(err.code)

            // Build redirect URL with error
            const redirectTo = new URL("/", frontendUrl)
            redirectTo.searchParams.set("error", errorCode)
            if (err.message && err.message !== errorCode) {
              redirectTo.searchParams.set("error_description", err.message)
            }
            return res.redirect(redirectTo.toString())
          }

          if (!user) {
            logger.error("[Discord callback] No user returned", {
              hasErr: !!err,
              err,
              user,
              info,
            })
            const redirectTo = new URL("/", frontendUrl)
            redirectTo.searchParams.set(
              "error",
              AuthErrorCodes.ACCOUNT_NOT_FOUND,
            )
            return res.redirect(redirectTo.toString())
          }

          req.logIn(user, (loginErr) => {
            if (loginErr) {
              logger.error("Discord login error", { error: loginErr })
              const redirectTo = new URL("/", frontendUrl)
              redirectTo.searchParams.set(
                "error",
                AuthErrorCodes.ACCOUNT_NOT_FOUND,
              )
              return res.redirect(redirectTo.toString())
            }

            const successRedirect = new URL(
              redirectPath,
              frontendUrl,
            ).toString()
            return res.redirect(successRedirect)
          })
        },
      )(req, res, next)
    },
  )

  // Citizen ID authentication routes
  app.get(
    "/auth/citizenid",
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query as { path?: string; action?: string }
      const path = query.path || "/market"
      const action = query.action === "signup" ? "signup" : "signin"

      // Validate the redirect path
      if (!validateRedirectPath(path)) {
        return res.status(400).json({ error: "Invalid redirect path" })
      }

      // Store the redirect path and action in session for later retrieval
      if (!req.session) {
        return res.status(500).json({ error: "Session not available" })
      }
      ;(req.session as any).citizenid_redirect_path = path
      ;(req.session as any).citizenid_auth_action = action

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
      if (!req.session) {
        return res.status(500).json({ error: "Session not available" })
      }
      ;(req.session as any).citizenid_redirect_path = "/settings"

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
      // Check for OAuth errors
      if (query.error) {
        const errorCode = mapErrorCodeToFrontend(query.error)
        const redirectTo = new URL("/", frontendUrl)
        redirectTo.searchParams.set("error", errorCode)
        if (query.error_description) {
          redirectTo.searchParams.set(
            "error_description",
            query.error_description,
          )
        }
        return res.redirect(redirectTo.toString())
      }

      // Get redirect path from session
      const redirectPath =
        (req.session as any)?.citizenid_redirect_path || "/market"

      // Clear it from session after retrieving
      if (req.session) {
        delete (req.session as any).citizenid_redirect_path
      }

      return passport.authenticate(
        "citizenid",
        {
          session: true,
          failWithError: true,
        },
        (err: any, user: User | false, info: any) => {
          if (err) {
            logger.error("[CitizenID login callback] Error", {
              error: err,
              errorMessage: err?.message,
              errorCode: err?.code,
              hasUser: !!user,
              info,
            })
            logger.error("Citizen ID login error", { error: err })
            const errorCode = mapErrorCodeToFrontend(err.code)

            // If username is taken, redirect to Discord login with settings path
            if (errorCode === CitizenIDErrorCodes.USERNAME_TAKEN) {
              // Use backend URL for auth endpoint
              const backendUrl = new URL(
                env.BACKEND_URL || "http://localhost:7000",
              )
              const discordLoginUrl = new URL("/auth/discord", backendUrl)
              discordLoginUrl.searchParams.set("path", "/settings")
              return res.redirect(discordLoginUrl.toString())
            }

            // Handle new error codes
            if (
              errorCode === AuthErrorCodes.ACCOUNT_NOT_FOUND ||
              errorCode === AuthErrorCodes.ACCOUNT_ALREADY_EXISTS
            ) {
              const redirectTo = new URL("/", frontendUrl)
              redirectTo.searchParams.set("error", errorCode)
              if (err.message && err.message !== errorCode) {
                redirectTo.searchParams.set("error_description", err.message)
              }
              return res.redirect(redirectTo.toString())
            }

            const redirectTo = new URL("/", frontendUrl)
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
            const redirectTo = new URL("/", frontendUrl)
            redirectTo.searchParams.set(
              "error",
              CitizenIDErrorCodes.AUTH_FAILED,
            )
            return res.redirect(redirectTo.toString())
          }

          req.logIn(user, (loginErr) => {
            if (loginErr) {
              logger.error("Citizen ID login error", { error: loginErr })
              const redirectTo = new URL("/", frontendUrl)
              redirectTo.searchParams.set(
                "error",
                CitizenIDErrorCodes.LOGIN_FAILED,
              )
              return res.redirect(redirectTo.toString())
            }

            const successRedirect = new URL(
              redirectPath,
              frontendUrl,
            ).toString()
            return res.redirect(successRedirect)
          })
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

      // Check for OAuth errors
      if (query.error) {
        const errorCode = mapErrorCodeToFrontend(query.error)
        const redirectTo = new URL("/settings", frontendUrl)
        redirectTo.searchParams.set("error", errorCode)
        if (query.error_description) {
          redirectTo.searchParams.set(
            "error_description",
            query.error_description,
          )
        }
        return res.redirect(redirectTo.toString())
      }

      // Clear redirect path from session
      if (req.session) {
        delete (req.session as any).citizenid_redirect_path
      }

      return passport.authenticate(
        "citizenid-link",
        {
          session: true,
          failWithError: true,
        },
        (err: any, user: User | false, info: any) => {
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

          req.logIn(user, (loginErr) => {
            if (loginErr) {
              logger.error("Citizen ID linking login error", {
                error: loginErr,
              })
              const redirectTo = new URL("/settings", frontendUrl)
              redirectTo.searchParams.set(
                "error",
                CitizenIDErrorCodes.LOGIN_FAILED,
              )
              return res.redirect(redirectTo.toString())
            }
            // Success - redirect to settings
            return res.redirect(new URL("/settings", frontendUrl).toString())
          })
        },
      )(req, res, next)
    },
  )

  app.get(
    "/logout",
    function (req: Request, res: Response, next: NextFunction) {
      req.logout((err) => {
        if (err) {
          return next(err)
        }

        // Destroy session in store (Postgres)
        req.session?.destroy((destroyErr) => {
          if (destroyErr) {
            logger.error("Session destroy error during logout", {
              error: destroyErr,
            })
          }

          // Clear the session cookie
          res.clearCookie("connect.sid", {
            path: "/",
            sameSite: "lax",
            secure: app.get("env") === "production",
          })

          // Redirect to frontend (or send 204 if this is an API-only logout)
          return res.redirect(frontendUrl.toString())
        })
      })
    },
  )
}
