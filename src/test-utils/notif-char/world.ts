/**
 * Seeding and observation helpers for the notification characterization suite.
 *
 * Every entity gets a readable label; observe() replaces ids with labels and
 * timestamps with "<ts>" so recorded deliveries compare stably.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import { recorder } from "./fakes.js"

const AVATAR = "5226c767-0599-419b-ae71-a7303c441db0"
const ORG_AVATAR = AVATAR
export const EMAIL_QUEUE = () => process.env.EMAIL_QUEUE_URL!
export const DISCORD_QUEUE = () => process.env.DISCORD_QUEUE_URL!
export const BACKEND_QUEUE = () => process.env.BACKEND_QUEUE_URL!

const PERMISSIONS = [
  "manage_roles",
  "manage_orders",
  "kick_members",
  "manage_invites",
  "manage_org_details",
  "manage_stock",
  "manage_market",
  "manage_recruiting",
  "manage_webhooks",
  "manage_blocklist",
  "claim_orders",
  "manage_theme",
] as const
export type Permission = (typeof PERMISSIONS)[number]

let seq = 0
const labels = new Map<string, string>()
const endpointOwner = new Map<string, string>()
/** Ids created by the code under test (not seeded): numbered by first appearance. */
const unknownIds = new Map<string, string>()

export function resetWorld() {
  seq = 0
  labels.clear()
  endpointOwner.clear()
  unknownIds.clear()
}

function unknownId(id: string): string {
  if (!unknownIds.has(id)) unknownIds.set(id, `uuid#${unknownIds.size + 1}`)
  return unknownIds.get(id)!
}

/** Deterministic UUID per label, so snapshots don't depend on insert order. */
function idFor(label: string): string {
  seq++
  const hex = Buffer.from(label).toString("hex").padEnd(12, "0").slice(0, 12)
  const id = `00000000-0000-4000-8${String(seq).padStart(3, "0")}-${hex}`
  labels.set(id, label)
  return id
}

export function label(id: string | null | undefined): string | null {
  if (id === null || id === undefined) return null
  return labels.get(String(id)) ?? normalize(String(id))
}

export function nameId(id: string, name: string) {
  labels.set(String(id), name)
}

let discordSeq = 100000000000000000n
function snowflake(): string {
  discordSeq += 1n
  return discordSeq.toString()
}

export interface SeededUser {
  user_id: string
  username: string
  label: string
  email: string | null
  discord_id: string | null
  endpoints: string[]
}

export async function user(
  name: string,
  opts: {
    email?: "verified" | "unverified" | "none"
    discord?: boolean
    push?: number
    role?: "user" | "admin"
    locale?: string
  } = {},
): Promise<SeededUser> {
  const db = getKnex()
  const user_id = idFor(`user:${name}`)
  const discord_id = opts.discord === false ? null : snowflake()
  await db("accounts").insert({
    user_id,
    username: name,
    display_name: name[0].toUpperCase() + name.slice(1),
    avatar: AVATAR,
    role: opts.role ?? "user",
    locale: opts.locale ?? "en",
    discord_id,
  })
  labels.set(String(discord_id), `discord:${name}`)
  if (discord_id) {
    await db("account_providers").insert({
      user_id,
      provider_type: "discord",
      provider_id: discord_id,
      is_primary: true,
    })
  }
  let email: string | null = null
  const emailMode = opts.email ?? "verified"
  if (emailMode !== "none") {
    email = `${name}@example.test`
    await db("user_emails").insert({
      user_id,
      email,
      email_verified: emailMode === "verified",
      is_primary: true,
    })
  }
  const endpoints: string[] = []
  for (let i = 0; i < (opts.push ?? 1); i++) {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${name}-${i}`
    await db("push_subscriptions").insert({
      user_id,
      endpoint,
      p256dh: "BFakeP256dh",
      auth: "fakeauth",
      user_agent: "char-test",
    })
    endpointOwner.set(endpoint, i === 0 ? name : `${name}#${i}`)
    endpoints.push(endpoint)
  }
  return { user_id, username: name, label: `user:${name}`, email, discord_id, endpoints }
}

export interface SeededOrg {
  contractor_id: string
  spectrum_id: string
  roles: Map<string, string>
}

export async function org(
  name: string,
  members: { user: SeededUser; perms: Permission[] | "owner" }[],
): Promise<SeededOrg> {
  const db = getKnex()
  const contractor_id = idFor(`org:${name}`)
  await db("contractors").insert({
    contractor_id,
    spectrum_id: name.toUpperCase(),
    kind: "independent",
    size: members.length,
    name: `Org ${name}`,
    avatar: ORG_AVATAR,
    banner: "0008300c-fc6a-4e4e-9488-7d696f00e8b2",
  })
  const roles = new Map<string, string>()
  const roleFor = async (perms: Permission[] | "owner") => {
    const key = perms === "owner" ? "owner" : perms.slice().sort().join("+") || "member"
    if (roles.has(key)) return roles.get(key)!
    const role_id = idFor(`role:${name}:${key}`)
    const row: Record<string, unknown> = {
      contractor_id,
      role_id,
      position: perms === "owner" ? 0 : 10 + roles.size,
      name: key,
    }
    for (const p of PERMISSIONS) row[p] = perms === "owner" ? true : perms.includes(p)
    await db("contractor_roles").insert(row)
    roles.set(key, role_id)
    return role_id
  }
  for (const m of members) {
    const role_id = await roleFor(m.perms)
    await db("contractor_members").insert({
      contractor_id,
      user_id: m.user.user_id,
      role: m.perms === "owner" ? "owner" : "member",
    })
    await db("contractor_member_roles").insert({ user_id: m.user.user_id, role_id })
  }
  return { contractor_id, spectrum_id: name.toUpperCase(), roles }
}

export async function shop(
  name: string,
  owner: { user: SeededUser } | { org: SeededOrg },
): Promise<{ shop_id: string }> {
  const shop_id = idFor(`shop:${name}`)
  await getKnex()("shops").insert({
    shop_id,
    slug: name,
    name: `Shop ${name}`,
    owner_user_id: "user" in owner ? owner.user.user_id : null,
    owner_contractor_id: "org" in owner ? owner.org.contractor_id : null,
  })
  return { shop_id }
}

async function actionId(action: string): Promise<number> {
  const row = await getKnex()("notification_actions").where({ action }).first()
  if (!row) throw new Error(`no action ${action}`)
  return Number(row.action_type_id)
}

export async function pushPref(u: SeededUser, action: string, enabled: boolean, o?: SeededOrg) {
  await getKnex()("push_notification_preferences").insert({
    user_id: u.user_id,
    action_type_id: await actionId(action),
    contractor_id: o?.contractor_id ?? null,
    enabled,
  })
}

export async function emailPref(u: SeededUser, action: string, enabled: boolean, o?: SeededOrg) {
  await getKnex()("email_notification_preferences").insert({
    user_id: u.user_id,
    action_type_id: await actionId(action),
    contractor_id: o?.contractor_id ?? null,
    enabled,
  })
}

/** Opt a user into email for every listed action (email is opt-in). */
export async function emailOptIn(u: SeededUser, actions: string[], o?: SeededOrg) {
  for (const a of actions) await emailPref(u, a, true, o)
}

export async function channelPref(
  u: SeededUser,
  action: string,
  channel: "site" | "discord",
  enabled: boolean,
) {
  await getKnex()("notification_channel_preferences").insert({
    user_id: u.user_id,
    action_type_id: await actionId(action),
    channel,
    enabled,
  })
}

export async function webhook(
  name: string,
  owner: { shop_id: string } | { user: SeededUser } | { org: SeededOrg },
  actions: string[],
) {
  const db = getKnex()
  const webhook_id = idFor(`webhook:${name}`)
  const webhook_url = `https://discord.com/api/webhooks/${name}/token`
  await db("notification_webhooks").insert({
    webhook_id,
    name,
    webhook_url,
    shop_id: "shop_id" in owner ? owner.shop_id : null,
    user_id: "user" in owner ? owner.user.user_id : null,
    contractor_id: "org" in owner ? owner.org.contractor_id : null,
  })
  for (const a of actions) {
    await db("webhook_actions").insert({ webhook_id, action_type_id: await actionId(a) })
  }
  return { webhook_id, webhook_url }
}

export async function discordSetup(opts: {
  owner: { shop_id: string } | { org: SeededOrg } | { user: SeededUser }
  channel: string
  threads?: boolean
  alerts?: boolean
}) {
  const [owner_type, owner_id] =
    "shop_id" in opts.owner
      ? ["shop", opts.owner.shop_id]
      : "org" in opts.owner
        ? ["org", opts.owner.org.contractor_id]
        : ["user", opts.owner.user.user_id]
  await getKnex()("discord_channel_setups").insert({
    channel_id: opts.channel,
    guild_id: `7${opts.channel.slice(1)}`,
    owner_type,
    owner_id,
    threads: opts.threads ?? false,
    alerts: opts.alerts ?? false,
  })
}

export async function order(
  name: string,
  o: {
    customer: SeededUser
    assigned?: SeededUser | null
    org?: SeededOrg | null
    shop?: { shop_id: string } | null
    status?: string
    thread_id?: string | null
    cost?: number
  },
) {
  const order_id = idFor(`order:${name}`)
  const [row] = await getKnex()("orders")
    .insert({
      order_id,
      kind: "Delivery",
      cost: o.cost ?? 25000,
      title: `Order ${name}`,
      description: `Description of ${name}`,
      customer_id: o.customer.user_id,
      assigned_id: o.assigned?.user_id ?? null,
      contractor_id: o.org?.contractor_id ?? null,
      shop_id: o.shop?.shop_id ?? null,
      status: o.status ?? "not-started",
      thread_id: o.thread_id ?? null,
    })
    .returning("*")
  if (o.thread_id) labels.set(String(o.thread_id), `thread:${name}`)
  return row
}

export async function offerSession(
  name: string,
  o: {
    customer: SeededUser
    assigned?: SeededUser | null
    org?: SeededOrg | null
    shop?: { shop_id: string } | null
    thread_id?: string | null
    cost?: number
  },
) {
  const db = getKnex()
  const id = idFor(`session:${name}`)
  const [session] = await db("offer_sessions")
    .insert({
      id,
      customer_id: o.customer.user_id,
      assigned_id: o.assigned?.user_id ?? null,
      contractor_id: o.org?.contractor_id ?? null,
      shop_id: o.shop?.shop_id ?? null,
      thread_id: o.thread_id ?? null,
    })
    .returning("*")
  const offerId = idFor(`offer:${name}`)
  await db("order_offers").insert({
    id: offerId,
    session_id: id,
    kind: "Delivery",
    cost: o.cost ?? 25000,
    title: `Offer ${name}`,
    description: `Description of ${name}`,
    actor_id: o.customer.user_id,
  })
  if (o.thread_id) labels.set(String(o.thread_id), `thread:${name}`)
  return session
}

export async function chat(name: string, o: { order_id?: string; session_id?: string }) {
  const chat_id = idFor(`chat:${name}`)
  await getKnex()("chats").insert({
    chat_id,
    order_id: o.order_id ?? null,
    session_id: o.session_id ?? null,
  })
  return { chat_id }
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g
/** Random tokens (unsubscribe, verification): 64 hex chars. */
const TOKEN = /\b[0-9a-f]{64}\b/g

/** Replace ids with labels and timestamps with "<ts>", recursively. */
export function normalize<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return "<ts>" as unknown as T
  if (typeof value === "string") {
    let s = value.replace(UUID, (m) => labels.get(m) ?? unknownId(m)).replace(ISO, "<ts>").replace(TOKEN, "<token>")
    for (const [id, l] of labels) {
      if (/^\d{15,}$/.test(id) && s.includes(id)) s = s.split(id).join(l)
    }
    for (const [ep, owner] of endpointOwner) if (s === ep) s = `push:${owner}`
    return s as unknown as T
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map((v) => normalize(v)) as unknown as T
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v)
    }
    return out as T
  }
  return value
}

export async function inAppRows() {
  const db = getKnex()
  const rows = await db("notification as n")
    .join("notification_object as no", "n.notification_object_id", "no.notification_object_id")
    .join("notification_actions as na", "no.action_type_id", "na.action_type_id")
    .select("n.notifier_id", "na.action", "no.entity_id", "n.notification_object_id", "n.read")
    .orderBy([{ column: "na.action" }, { column: "n.notifier_id" }])
  const out = []
  for (const r of rows) {
    const actors = await db("notification_change")
      .where({ notification_object_id: r.notification_object_id })
      .pluck("actor_id")
    out.push({
      to: label(r.notifier_id),
      action: r.action,
      entity: label(r.entity_id),
      actors: actors.map((a: string) => label(a)),
      ...(r.read ? { read: true } : {}),
    })
  }
  return out
}

export interface Observed {
  in_app: unknown[]
  push: unknown[]
  email: unknown[]
  email_queue: unknown[]
  discord: unknown[]
  discord_queue: unknown[]
  webhooks: unknown[]
  websocket: unknown[]
  errors: unknown[]
  warnings: unknown[]
}

/**
 * Drain the email queue through the real consumer (as the 5 s timer in
 * tasks/tasks.ts does in production), then collect everything the fakes saw.
 */
export async function observe(opts: { drainEmail?: boolean } = {}): Promise<Observed> {
  if (opts.drainEmail !== false) await drainEmailQueue()
  const r = recorder()
  const emailQueued = r.sqs.sent.filter((m) => m.queueUrl === EMAIL_QUEUE()).map((m) => m.body)
  return normalize({
    in_app: await inAppRows(),
    push: r.push
      .map((p) => ({ to: `push:${endpointOwner.get(p.endpoint) ?? p.endpoint}`, payload: p.payload }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    email: r.email.map((e) => ({
      to: e.to,
      subject: e.subject,
      text: e.text,
      html_length_bucket: e.html ? Math.round(e.html.length / 500) * 500 : 0,
    })),
    email_queue: emailQueued,
    discord: r.discord,
    discord_queue: r.sqs.sent.filter((m) => m.queueUrl === DISCORD_QUEUE()).map((m) => m.body),
    webhooks: r.fetch,
    websocket: r.websocket,
    errors: r.logs.filter((l) => l.level === "error").map((l) => l.message),
    warnings: r.logs.filter((l) => l.level === "warn").map((l) => l.message),
  })
}

/** Compact view: who got what on which channel. */
export function summary(o: Observed) {
  const lines: string[] = []
  for (const r of o.in_app as { to: string; action: string; entity: string }[]) {
    lines.push(`in_app  ${r.to} ${r.action} (${r.entity})`)
  }
  for (const p of o.push as { to: string; payload: { title: string; data?: { type?: string } } }[]) {
    lines.push(`push    ${p.to} [${p.payload.data?.type ?? "?"}] ${p.payload.title}`)
  }
  for (const e of o.email as { to: string[]; subject: string }[]) {
    lines.push(`email   ${e.to.join(",")} ${e.subject}`)
  }
  for (const d of o.discord as { method: string; route: string }[]) {
    lines.push(`discord ${d.method.toUpperCase()} ${d.route}`)
  }
  for (const q of o.discord_queue as { type: string }[]) {
    lines.push(`dqueue  ${q.type}`)
  }
  for (const w of o.webhooks as { url: string; body: { username?: string } }[]) {
    lines.push(`webhook ${w.url.replace("https://discord.com/api/webhooks/", "").replace("/token", "")} ${w.body?.username ?? ""}`.trim())
  }
  for (const w of o.websocket) lines.push(`ws      ${JSON.stringify(w).slice(0, 60)}`)
  for (const e of o.errors as string[]) lines.push(`ERROR   ${e}`)
  return lines
}

export async function drainEmailQueue(maxRounds = 10) {
  const { processEmailQueue } = await import("../../tasks/email-queue-consumer.js")
  for (let i = 0; i < maxRounds; i++) {
    const before = recorder().sqs.deleted.length
    const pending = recorder().sqs.queues.get(EMAIL_QUEUE())?.length ?? 0
    if (!pending) return
    await processEmailQueue()
    if (recorder().sqs.deleted.length === before) return
  }
}

// ---------------------------------------------------------------------------
// Market V2 listings and watchlist items
// ---------------------------------------------------------------------------

export async function gameItem(name: string) {
  const id = idFor(`item:${name}`)
  // game_items is seeded with the real catalogue; keep test names unique.
  await getKnex()("game_items").insert({ id, name: `CharTest ${name}`, type: "Other" })
  return { id }
}

export async function listing(
  name: string,
  o: {
    shop: { shop_id: string }
    seller: { user: SeededUser } | { org: SeededOrg }
    title: string
    price: number
    quantity?: number
    gameItem?: { id: string } | null
    status?: "active" | "inactive"
    visibility?: "public" | "private" | "unlisted"
    saleType?: "fixed" | "auction" | "negotiable"
  },
) {
  const db = getKnex()
  const listing_id = idFor(`listing:${name}`)
  await db("listings").insert({
    listing_id,
    seller_id: "user" in o.seller ? o.seller.user.user_id : o.seller.org.contractor_id,
    seller_type: "user" in o.seller ? "user" : "contractor",
    shop_id: o.shop.shop_id,
    title: o.title,
    description: `About ${o.title}`,
    status: o.status ?? "active",
    visibility: o.visibility ?? "public",
    sale_type: o.saleType ?? "fixed",
  })
  await db("listing_items").insert({
    item_id: idFor(`listing-item:${name}`),
    listing_id,
    game_item_id: o.gameItem?.id ?? null,
    pricing_mode: "unified",
    base_price: o.price,
    quantity_available: o.quantity ?? 5,
  })
  return { listing_id }
}

export async function watch(
  name: string,
  u: SeededUser,
  o: { query: string; maxPrice: number; gameItem?: { id: string }; lastNotifiedAt?: Date },
) {
  const id = idFor(`watch:${name}`)
  await getKnex()("watchlist_items").insert({
    id,
    user_id: u.user_id,
    query: o.query,
    max_price: o.maxPrice,
    game_item_id: o.gameItem?.id ?? null,
    last_notified_at: o.lastNotifiedAt ?? null,
  })
  return { id }
}
