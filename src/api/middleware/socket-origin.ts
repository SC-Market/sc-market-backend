import type { IncomingMessage } from "node:http"

/**
 * Socket.IO `allowRequest` guard for /ws.
 *
 * Socket.IO's `cors` option only applies to HTTP long-polling. A WebSocket
 * upgrade is not subject to CORS, so without an Origin check any site could
 * open a socket with the visitor's SameSite=None cookies and join their chat
 * rooms (cross-site WebSocket hijacking). Browsers always send Origin on a
 * WebSocket handshake; non-browser clients may omit it.
 */
export function createSocketAllowRequest(options: {
  enforceCloudflare: boolean
  isFromCloudflare: (req: IncomingMessage) => boolean
  isOriginAllowed: (origin: string) => Promise<boolean>
}) {
  return (
    req: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void,
  ): void => {
    if (options.enforceCloudflare && !options.isFromCloudflare(req)) {
      callback("Direct origin access is not allowed", false)
      return
    }
    const origin = req.headers.origin
    if (!origin) {
      callback(null, true)
      return
    }
    options.isOriginAllowed(origin).then(
      (ok) => callback(ok ? null : "Origin not allowed", ok),
      () => callback("Origin check failed", false),
    )
  }
}
