declare module "i18next" {
  interface i18next {
    t(key: string, options?: any): string
    language: string
    languages: string[]
    changeLanguage(lng: string): Promise<void>
    init(options?: any): void
  }

  const i18next: i18next
  export default i18next
}

declare module "i18next-http-middleware" {
  import { RequestHandler } from "express"
  import i18next from "i18next"

  interface HandleOptions {
    ignoreRoutes?: string[]
    removeLngFromUrl?: boolean
  }

  export function handle(
    i18nextInstance: i18next,
    options?: HandleOptions,
  ): RequestHandler
  export function getResourcesHandler(i18nextInstance: i18next): RequestHandler
  export function missingKeyHandler(i18nextInstance: i18next): RequestHandler
  export function addRoute(
    i18nextInstance: i18next,
    path: string,
    lngs: string[],
    app: any,
    verb: string,
    fc: any,
  ): void
  export function addRoute(
    i18nextInstance: i18next,
    path: string,
    lngs: string[],
    fc: any,
  ): void
}
