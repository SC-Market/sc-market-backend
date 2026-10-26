/**
 * Start a JWT browser session for `user`: a DB-stored refresh token plus an
 * access token naming it (sid), set as the usual httpOnly cookies. Every
 * login path uses this (OAuth callbacks in auth-routes.ts, test-login).
 */

import type { Request, Response } from "express"
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  setAuthCookies,
  type UserForJWT,
} from "./jwt.js"

export async function issueLoginCookies(
  req: Request,
  res: Response,
  user: UserForJWT,
): Promise<string> {
  const refreshToken = generateRefreshToken()
  const sid = await saveRefreshToken(user.user_id, refreshToken, req)
  const accessToken = generateAccessToken(user, { sid })
  setAuthCookies(res, accessToken, refreshToken)
  return sid
}
