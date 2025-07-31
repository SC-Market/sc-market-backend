import i18next from "i18next"
import i18nextHttpMiddleware from "i18next-http-middleware"
import { Request, Response, NextFunction } from "express"
import { DBUser } from "../../../../clients/database/db-models.js"

// Default language resources
const resources = {
  en: {
    translation: {},
  },
}

// Initialize i18next
i18next.init({
  resources,
  lng: "en", // default language
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  detection: {
    order: ["header", "querystring", "cookie"],
    lookupHeader: "accept-language",
    lookupQuerystring: "lng",
    lookupCookie: "i18next",
    caches: ["cookie"],
  },
})

// Export the configured i18next instance
export { i18next }

// Export the middleware for Express
export const i18nMiddleware = i18nextHttpMiddleware.handle(i18next)

// Helper function to get translation with fallback
export const t = (key: string, options?: any): string => {
  return i18next.t(key, options)
}

// Helper function to get translation for a specific language
export const tWithLang = (key: string, lang: string, options?: any): string => {
  return i18next.t(key, { lng: lang, ...options })
}

// Type for the request with i18n
export interface RequestWithI18n extends Request {
  language: string
  languages: string[]
  t: (key: string, options?: any) => string
}

// Middleware to add translation function to request
export const addTranslationToRequest = (
  req: RequestWithI18n,
  res: Response,
  next: NextFunction,
): void => {
  req.t = (key: string, options?: any) => {
    // Use detected language as fallback
    return i18next.t(key, { lng: req.language, ...options })
  }
  next()
}

// Enhanced middleware that can access user's locale preference from database
export const addTranslationToRequestWithUser = (
  req: RequestWithI18n,
  res: Response,
  next: NextFunction,
): void => {
  req.t = (key: string, options?: any) => {
    // If user is authenticated, try to get their locale preference
    if (req.user) {
      try {
        return i18next.t(key, {
          lng: (req.user as DBUser).locale,
          ...options,
        })
      } catch (error) {
        // Fallback to detected language if there's an error
        return i18next.t(key, { lng: req.language, ...options })
      }
    }
    // Use detected language as fallback
    return i18next.t(key, { lng: req.language, ...options })
  }
  next()
}

// Export default for convenience
export default i18next
