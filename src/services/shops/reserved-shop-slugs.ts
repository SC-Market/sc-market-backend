/**
 * Words no shop may take as its slug, because a URL with the slug in it would
 * resolve to something else.
 *
 * A shop slug sits in these path positions:
 *   frontend  /shops/:slug   (public profile; /shops/create is a page)
 *             /shop/:shopSlug (shop dashboard; only children follow the slug)
 *   backend   /api/v2/shops/{slug}   (GET; /shops/mine, /shops/by-owner,
 *             /shops/slug-availability are routes, POST /shops/quick too)
 *             /api/shops/...         (v1; /api/shops/game is the in-game shop API)
 *
 * This list is the single source for both repos: it is published in the
 * OpenAPI spec as the ReservedShopSlug enum, which the frontend's route-table
 * test reads, and the backend route test (reserved-shop-slugs.test.ts) checks
 * every literal segment at the slug position of the generated route table
 * against it. A new route segment that is not listed here fails one of those
 * tests. The rest of the list are words a future route is likely to use.
 *
 * Compared lowercase. Existing shops that already hold one of these keep it
 * (see shop-slug.service.ts); new shops and renames can't take it.
 */
export enum ReservedShopSlug {
  // Route segments at the slug position today
  Mine = "mine",
  Quick = "quick",
  ByOwner = "by-owner",
  SlugAvailability = "slug-availability",
  Create = "create",
  Game = "game",
  // Likely future routes and app-wide words
  New = "new",
  Edit = "edit",
  Settings = "settings",
  Manage = "manage",
  Dashboard = "dashboard",
  Admin = "admin",
  Api = "api",
  All = "all",
  Browse = "browse",
  Search = "search",
  Directory = "directory",
  Explore = "explore",
  Featured = "featured",
  Popular = "popular",
  Trending = "trending",
  Top = "top",
  Categories = "categories",
  Category = "category",
  Tags = "tags",
  Reviews = "reviews",
  Listings = "listings",
  Services = "services",
  Orders = "orders",
  Stock = "stock",
  Customers = "customers",
  Help = "help",
  About = "about",
  Support = "support",
  Login = "login",
  Logout = "logout",
  Signup = "signup",
  Register = "register",
  Account = "account",
  Profile = "profile",
  Shop = "shop",
  Shops = "shops",
  Market = "market",
  ScMarket = "sc-market",
  Scmarket = "scmarket",
  Official = "official",
  Staff = "staff",
  Moderator = "moderator",
  System = "system",
  Root = "root",
  Null = "null",
  Undefined = "undefined",
  Index = "index",
  Www = "www",
  Static = "static",
  Assets = "assets",
}

export const RESERVED_SHOP_SLUGS: ReadonlySet<string> = new Set<string>(
  Object.values(ReservedShopSlug),
)

/** The reserved word `slug` is (compared lowercase), if any. */
export function reservedShopSlug(slug: string): ReservedShopSlug | undefined {
  const lower = slug.toLowerCase()
  return Object.values(ReservedShopSlug).find((word) => word === lower)
}
