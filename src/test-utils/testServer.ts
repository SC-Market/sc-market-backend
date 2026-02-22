import express, { Express } from "express"
import { RegisterRoutes } from "../api/generated/routes.js"
import { setupAuthRoutes } from "../api/routes/auth-routes.js"

/**
 * Create an Express app instance for testing
 * This sets up the app with all middleware and routes
 */
export function createTestServer(): Express {
  const app = express()

  // Add basic middleware
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Register TSOA routes
  RegisterRoutes(app)
  
  // Setup auth routes with test frontend URL
  const frontendUrl = new URL("http://localhost:5173")
  setupAuthRoutes(app, frontendUrl)

  return app
}

/**
 * Create a minimal Express app for testing specific routes
 * Use this when you want to test routes in isolation
 */
export function createMinimalTestServer(): Express {
  return express()
}
