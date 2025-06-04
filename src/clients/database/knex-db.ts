import Knex, { Knex as KnexClass } from "knex"
import { Profile, Strategy } from "passport-discord"
import {
  ContractorBody,
  MessageBody,
  PostBody,
  User,
} from "../../api/routes/v1/api-models.js"
import { LRUCache } from "lru-cache"
import {
  AvailabilitySpan,
  DBAccountSettings,
  DBAggregateComplete,
  DBAggregateListingComplete,
  DBAggregateListingRaw,
  DBAggregateRaw,
  DBAuctionDetails,
  DBAvailabilityEntry,
  DBBuyOrder,
  DBChat,
  DBChatParticipant,
  DBComment,
  DBCommentVote,
  DBContractor,
  DBContractorInvite,
  DBContractorInviteCode,
  DBContractorMember,
  DBContractorMemberRole,
  DBContractorRole,
  DBDelivery,
  DBFollow,
  DBImageResource,
  DBMarketAggregate,
  DBMarketAggregateListing,
  DBMarketBid,
  DBMarketCategory,
  DBMarketItem,
  DBMarketListing,
  DBMarketListingDetails,
  DBMarketListingDetailsBase,
  DBMarketListingImage,
  DBMarketMultiple,
  DBMarketMultipleListing,
  DBMarketOffer,
  DBMarketOfferListing,
  DBMarketOrder,
  DBMarketSearchResult,
  DBMessage,
  DBMultipleComplete,
  DBMultipleListingCompositeComplete,
  DBMultipleListingRaw,
  DBMultipleRaw,
  DBNotification,
  DBNotificationActions,
  DBNotificationChange,
  DBNotificationObject,
  DBNotificationWebhook,
  DBOffer,
  DBOfferMarketListing,
  DBOfferSession,
  DBOrder,
  DBOrderApplicant,
  DBOrderComment,
  DBPost,
  DBPostPhoto,
  DBPriceHistory,
  DBRecruitingPost,
  DBRecruitingVote,
  DBReview,
  DBService,
  DBServiceImage,
  DBShip,
  DBTransaction,
  DBUniqueListing,
  DBUniqueListingComplete,
  DBUniqueListingRaw,
  DBUser,
  DBWebhookActions,
  MinimalContractor,
  MinimalUser,
  OrderApplicantResponse,
} from "./db-models.js"
import { Database } from "./db-driver.js"
import { cdn } from "../cdn/cdn.js"
import {
  formatBid,
  formatInvite,
  formatListing,
  formatReview,
  getContractorRating,
  getUserRating,
} from "../../api/routes/v1/util/formatting.js"
import { RecruitingSearchQuery } from "../../api/routes/v1/recruiting/recruiting.js"
import { RateLimiterPostgres } from "rate-limiter-flexible"
import { RESTGetAPIUserResult, Routes } from "discord-api-types/v10"
import { rest } from "../../api/routes/v1/util/discord.js"
import pg from "pg"
import { serializeOrderDetails } from "../../api/routes/v1/orders/serializers.js"
import {
  DBContractOffer,
  DBPublicContract,
} from "../../api/routes/v1/contracts/types.js"
import { serializeOfferSession } from "../../api/routes/v1/offers/serializers.js"
import { env } from "../../config/env.js"
import {
  MarketSearchQuery,
  OrderStats,
} from "../../api/routes/v1/market/types.js"

pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(" ", "T") + "Z"))

const dbConfig: {
  [key: string]: string
} = JSON.parse(env.DATABASE_PASS!)

export interface CachedDiscordUser {
  id: string
  username: string
  discriminator: string
}

export class KnexDatabase implements Database {
  knex: KnexClass
  strategy?: Strategy
  discord_profile_cache: LRUCache<string, CachedDiscordUser, void>
  ratelimiter: RateLimiterPostgres

  constructor(
    databaseConfig: KnexClass.Config | string = {
      client: "pg",
      connection: {
        host: dbConfig.host || env.DATABASE_HOST || "localhost",
        user: dbConfig.username || env.DATABASE_USER || "postgres",
        password: dbConfig.password || env.DATABASE_PASS || "",
        database: dbConfig.dbname || env.DATABASE_TARGET || "postgres",
        port:
          (dbConfig.port as unknown as number) ||
          (env.DATABASE_PORT ? +env.DATABASE_PORT : 5431),
      },
      pool: { min: 0, max: 5 },
    },
  ) {
    this.knex = Knex(databaseConfig)
    this.discord_profile_cache = new LRUCache({
      max: 500,

      // for use with tracking overall storage size
      maxSize: 5000,
      sizeCalculation: (value, key) => {
        return 1
      },

      // how long to live in ms
      ttl: 1000 * 60 * 60, // hour

      // return stale items before removing from cache?
      allowStale: false,

      updateAgeOnGet: false,
      updateAgeOnHas: false,

      // async method to use for cache.fetch(), for
      // stale-while-revalidate type of behavior
      fetchMethod: async (
        key: string,
        staleValue,
        { options, signal, context },
      ): Promise<CachedDiscordUser | undefined> => {
        const user = await this.getUser({ user_id: key })

        const cached = this.discord_profile_cache.get(key)

        if (cached) {
          return cached
        }

        if (!user.discord_access_token) {
          return staleValue
        }

        if (!this.strategy) {
          return staleValue
        }

        let profile: CachedDiscordUser | undefined = staleValue
        try {
          profile = await new Promise((resolve, reject) =>
            this.strategy!.userProfile(
              user.discord_access_token!,
              (err, profile: Profile) => (err ? reject(err) : resolve(profile)),
            ),
          )
        } catch (e) {
          try {
            profile = (await rest.get(
              Routes.user(user.discord_id),
            )) as RESTGetAPIUserResult
          } catch (error) {
            console.error(error)
          }
        }

        return profile
      },
    })

    this.ratelimiter = new RateLimiterPostgres(
      {
        storeClient: this.knex,
        storeType: `knex`, // knex requires this option
        points: 60, // Number of points
        duration: 60, // Per 60 seconds
      },
      (error) => error && console.log(error),
    )
  }

  setStrategy(strategy?: Strategy) {
    this.strategy = strategy
  }

  async insertUserRaw(data: Partial<DBUser> | Partial<DBUser>[]) {
    return (await this.knex<DBUser>("accounts").insert(data).returning("*"))[0]
  }

  async insertUser(
    profile: CachedDiscordUser,
    access_token: string,
    refresh_token: string,
  ): Promise<User> {
    let user = await this.knex<DBUser>("accounts")
      .where("discord_id", profile.id)
      .first()

    if (user == null) {
      user = (
        await this.knex<DBUser>("accounts")
          .insert({
            discord_id: profile.id,
            display_name: profile.username,
            username: profile.username,
            discord_access_token: access_token,
            discord_refresh_token: refresh_token,
          })
          .returning("*")
      )[0]
    } else {
      await this.updateUser(
        { user_id: user.user_id },
        {
          discord_access_token: access_token,
          discord_refresh_token: refresh_token,
        },
      )
    }

    return {
      // discord_data: profile,
      discord_id: profile.id,
      user_id: user!.user_id,
      display_name: user!.display_name,
      role: user!.role,
      username: user!.display_name,
    } as User
  }

  async insertContractor(details: ContractorBody): Promise<DBContractor> {
    return (
      await this.knex<DBContractor>("contractors")
        .insert(details)
        .returning("*")
    )[0]
  }

  /**
   * @deprecated Use `insertContractorMemberRole` instead
   * @param contractor_id
   * @param user_id
   * @param role
   */
  async insertContractorMember(
    contractor_id: string,
    user_id: string,
    role: string,
  ): Promise<DBContractorMember> {
    return (
      await this.knex<DBContractorMember>("contractor_members")
        .insert({ contractor_id, user_id, role })
        .returning("*")
    )[0]
  }

  /**
   * @deprecated
   * @param where
   * @param value
   */
  async updateContractorMember(
    where: any,
    value: any,
  ): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .update(value)
      .where(where)
      .returning("*")
  }

  /**
   * @deprecated
   * @param where
   */
  async removeContractorMember(where: any): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeUserContractorRoles(
    contractor_id: string,
    user_id: string,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where({ user_id: user_id })
      .andWhere({
        role_id: this.knex.raw(
          "ANY(?)",
          this.knex("contractor_roles")
            .where({ contractor_id })
            .select("role_id"),
        ),
      })
      .delete()
      .returning("*")
  }

  async getUser(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<User> {
    const user = await this.knex<DBUser>("accounts").where(where).first()

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      ...(options.noBalance ? {} : { balance: user.balance }),
      user_id: user.user_id!,
      display_name: user!.display_name,
      profile_description: user.profile_description,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      rsi_confirmed: user.rsi_confirmed,
      discord_id: user.discord_id,
      discord_access_token: user.discord_access_token,
      discord_refresh_token: user.discord_refresh_token,
      official_server_id: user.official_server_id,
      discord_thread_channel_id: user.discord_thread_channel_id,
      market_order_template: user.market_order_template,
    } as User
  }

  async getLogin(where: any): Promise<User> {
    const user = await this.knex<DBUser>("accounts").where(where).first()

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      user_id: user.user_id!,
      display_name: user!.display_name,
      profile_description: user.profile_description,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      rsi_confirmed: user.rsi_confirmed,
      discord_id: user.discord_id,
    } as User
  }

  async getMinimalUser(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<MinimalUser> {
    const user = await this.knex<DBUser>("accounts")
      .where(where)
      .first("accounts.*")

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      username: user.username,
      avatar: (await cdn.getFileLinkResource(user.avatar))!,
      display_name: user.display_name,
      rating: await getUserRating(user.user_id),
    }
  }

  async getMinimalUsersAdmin(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ) {
    const users = await this.knex<DBUser>("accounts").where(where).select()

    return await Promise.all(
      users.map(async (user) => ({
        username: user.username,
        avatar: (await cdn.getFileLinkResource(user.avatar))!,
        display_name: user.display_name,
        role: user.role,
        rating: await getUserRating(user.user_id),
        created_at: user.created_at.getTime(),
      })),
    )
  }

  async getAllMinimalUsers(
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<MinimalUser[]> {
    const users = await this.knex<DBUser>("accounts").select()

    return await Promise.all(
      users.map(async (user) => ({
        username: user.username,
        avatar: (await cdn.getFileLinkResource(user.avatar))!,
        display_name: user.display_name,
        rating: {
          avg_rating: 0,
          rating_count: 0,
          streak: 0,
          total_orders: 0,
        },
      })),
    )
  }

  async incrementUserBalance(user_id: string, amount: number): Promise<void> {
    await this.knex("accounts")
      .where({ user_id: user_id })
      .increment("balance", amount)
  }

  async decrementUserBalance(user_id: string, amount: number): Promise<void> {
    await this.knex("accounts")
      .where({ user_id: user_id })
      .decrement("balance", amount)
  }

  async incrementContractorBalance(
    contractor_id: string,
    amount: number,
  ): Promise<void> {
    await this.knex("contractors")
      .where({ contractor_id: contractor_id })
      .increment("balance", amount)
  }

  async decrementContractorBalance(
    contractor_id: string,
    amount: number,
  ): Promise<void> {
    await this.knex("contractors")
      .where({ contractor_id: contractor_id })
      .decrement("balance", amount)
  }

  async getContractor(where: any): Promise<DBContractor> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    if (!contractor) {
      throw new Error("Invalid contractor!")
    }

    return contractor
  }

  async getContractorSafe(
    where: any,
  ): Promise<DBContractor | undefined | null> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    return contractor
  }

  async getMinimalContractor(where: any): Promise<MinimalContractor> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    if (!contractor) {
      throw new Error("Invalid contractor!")
    }

    return {
      spectrum_id: contractor.spectrum_id,
      avatar: (await cdn.getFileLinkResource(contractor.avatar))!,
      name: contractor.name,
      rating: await getContractorRating(contractor.contractor_id),
    }
  }

  async getContractorListings(where: any): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractors").where(where).select()
  }

  async insertContractorInvites(values: any[]): Promise<DBContractorInvite[]> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .insert(values)
      .returning("*")
  }

  async removeContractorInvites(user_id: string, contractor_id: string) {
    const invites = await this.knex<DBContractorInvite>("contractor_invites")
      .where({ user_id, contractor_id })
      .delete()
      .returning("*")

    const action =
      await database.getNotificationActionByName("contractor_invite")
    for (const invite of invites) {
      await this.knex<DBNotificationObject>("notification_object")
        .where({
          entity_id: invite.invite_id,
          action_type_id: action.action_type_id,
        })
        .delete()
    }
  }

  async removeNotificationObject(where: any) {
    return this.knex<DBNotificationObject>("notification_object")
      .where(where)
      .delete()
      .returning("*")
  }

  async getContractorInvites(where: any): Promise<DBContractorInvite[]> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .where(where)
      .select()
  }

  async getContractorInvite(
    where: any,
  ): Promise<DBContractorInvite | undefined | null> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .where(where)
      .first()
  }

  async getInviteCodes(where: any): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .select("*")
  }

  async updateInviteCodes(
    where: any,
    body: any,
  ): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .update(body)
      .returning("*")
  }

  async deleteInviteCodes(where: any): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .delete("*")
  }

  async getInviteCode(where: any): Promise<DBContractorInviteCode | null> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .first("*")
  }

  async createInviteCode(
    body: Partial<DBContractorInviteCode>,
  ): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .insert(body)
      .returning("*")
  }

  async getImageResource(where: any): Promise<DBImageResource> {
    const resource = await this.knex<DBImageResource>("image_resources")
      .where(where)
      .first()

    if (!resource) {
      throw new Error("Invalid resource!")
    }

    return resource
  }

  async insertImageResource(values: any): Promise<DBImageResource> {
    const resources = await this.knex<DBImageResource>("image_resources")
      .insert(values)
      .returning("*")
    return resources[0]
  }

  async getImageResources(where: any): Promise<DBImageResource[]> {
    return this.knex<DBImageResource>("image_resources").where(where).select()
  }

  async removeImageResource(where: any): Promise<DBImageResource[]> {
    return this.knex<DBImageResource>("image_resources")
      .where(where)
      .delete()
      .returning("*")
  }

  async getUserContractors(where: any): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractor_members")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_members.contractor_id",
      )
      .where(where)
      .select("contractors.*")
  }

  async getUserContractorRoles(where: any): Promise<
    {
      spectrum_id: string
      role: string
      name: string
    }[]
  > {
    return this.knex<{
      spectrum_id: string
      role: string
      name: string
    }>("contractor_members")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_members.contractor_id",
      )
      .where(where)
      .select(
        "contractors.spectrum_id",
        "contractor_members.role",
        "contractors.name",
      )
  }

  async getContractorMembersUsernames(where: any): Promise<
    {
      username: string
      role: string
    }[]
  > {
    return (
      this.knex<{
        username: string
        role: string
      }>("contractor_members")
        // .join('contractors', 'contractors.contractor_id', '=', 'contractor_members.contractor_id')
        .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
        .where(where)
        .select("accounts.username", "contractor_members.role")
    )
  }

  async getContractorMembersUsernamesAndID(where: any): Promise<
    {
      username: string
      role: string
      user_id: string
    }[]
  > {
    return (
      this.knex<{
        username: string
        role: string
        user_id: string
      }>("contractor_members")
        // .join('contractors', 'contractors.contractor_id', '=', 'contractor_members.contractor_id')
        .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
        .where(where)
        .select(
          "accounts.username",
          "contractor_members.role",
          "accounts.user_id",
        )
    )
  }

  async getContractorMembers(where: any): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .where(where)
      .select("*")
  }

  async getContractorMemberRoles(
    where: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where(where)
      .select("*")
  }

  async getMembersWithMatchingRole(
    contractor_id: string,
    subquery: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .whereExists(
        this.knex("contractor_roles")
          .whereRaw(
            "contractor_member_roles.role_id = contractor_roles.role_id",
          )
          .andWhere(subquery)
          .andWhere("contractor_id", contractor_id),
      )
      .select("contractor_member_roles.*")
  }

  async getContractorCustomers(contractor_id: string): Promise<
    (DBUser & {
      spent: number
    })[]
  > {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("accounts")
      .join("orders", "accounts.user_id", "=", "orders.customer_id")
      .where({ "orders.contractor_id": contractor_id })
      .groupBy("accounts.user_id")
      .select("accounts.*", this.knex.raw("SUM(orders.cost) as spent"))
  }

  async getContractorReviews(contractor_id: string): Promise<DBReview[]> {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("order_reviews")
      .join("orders", "orders.order_id", "=", "order_reviews.order_id")
      .where({ "orders.contractor_id": contractor_id, role: "customer" })
      .select("order_reviews.*")
  }

  async getUserReviews(user_id: string): Promise<DBReview[]> {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("order_reviews")
      .join("orders", "orders.order_id", "=", "order_reviews.order_id")
      .where({
        "orders.assigned_id": user_id,
        "orders.contractor_id": null,
        role: "customer",
      })
      .orWhere({ "orders.customer_id": user_id, role: "contractor" })
      .select("order_reviews.*")
  }

  async getOrderCount(where: Partial<DBOrder>): Promise<number> {
    return +(
      await this.knex<{ count: number }>("orders").where(where).count()
    )[0].count
  }

  /*
    SELECT order_reviews.*
        FROM order_reviews
        JOIN orders
            ON orders.order_id = order_reviews.order_id
        WHERE orders.assigned_id = 97534879-843f-446d-b37b-d264f7d1865e
            AND orders.contractor_id IS NULL
    *
    */

  /**
   * @deprecated
   * @param user_id
   * @param contractor_id
   */
  async getContractorRoleLegacy(
    user_id: string,
    contractor_id: string,
  ): Promise<
    | {
        username: string
        role: string
      }
    | null
    | undefined
  > {
    return this.knex<{
      username: string
      role: string
    }>("contractor_members")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_members.contractor_id",
      )
      .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
      .where({
        "contractors.contractor_id": contractor_id,
        "accounts.user_id": user_id,
      })
      .first("accounts.username", "contractor_members.role")
  }

  async getContractorRoles(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles").where(where).select()
  }

  async getContractorRolesPublic(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .select("role_id", "name", "contractor_id", "position")
  }

  async getContractorRole(
    where: any,
  ): Promise<DBContractorRole | null | undefined> {
    return this.knex<DBContractorRole>("contractor_roles").where(where).first()
  }

  async insertContractorMemberRole(
    values: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .insert(values)
      .returning("*")
  }

  async insertContractorRole(values: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .insert(values)
      .returning("*")
  }

  async updateContractorRole(
    where: any,
    values: any,
  ): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .update(values)
      .returning("*")
  }

  async deleteContractorRole(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeContractorMemberRoles(
    where: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMemberRoles(
    contractor_id: string,
    user_id: string,
  ): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .join(
        "contractor_member_roles",
        "contractor_member_roles.role_id",
        "=",
        "contractor_roles.role_id",
      )
      .where({
        "contractor_roles.contractor_id": contractor_id,
        "contractor_member_roles.user_id": user_id,
      })
      .select("contractor_roles.*")
  }

  async isContractorAdmin(
    user_id: string,
    contractor_id: string,
  ): Promise<boolean> {
    return ["admin", "owner"].includes(
      (await database.getContractorRoleLegacy(user_id, contractor_id))?.role ||
        "",
    )
  }

  async isContractorOwner(
    user_id: string,
    contractor_id: string,
  ): Promise<boolean> {
    return ["owner"].includes(
      (await database.getContractorRoleLegacy(user_id, contractor_id))?.role ||
        "",
    )
  }

  async getContractorFields(where: any): Promise<
    {
      field: string
      contractor_id: string
    }[]
  > {
    return this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_fields.contractor_id",
      )
      .where(where)
      .select("contractor_fields.*")
  }

  async setContractorFields(
    contractor_id: string,
    fields: string[],
  ): Promise<
    {
      field: string
      contractor_id: string
    }[]
  > {
    await this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .where({ contractor_id })
      .delete()

    return this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .insert(fields.map((f) => ({ field: f, contractor_id })))
      .returning("*")
  }

  async updateUser(where: any, values: Partial<DBUser>) {
    return this.knex<DBUser>("accounts")
      .where(where)
      .update(values)
      .returning("*")
  }

  async updateContractor(where: any, values: Partial<DBContractor>) {
    return this.knex<DBContractor>("contractors")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getUsers() {
    return this.knex<DBUser>("accounts").select()
  }

  async getUsersWhere(where: any = {}) {
    return this.knex<DBUser>("accounts").where(where).select()
  }

  async getOrders(where: any): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders").where(where).select()
  }

  async getRelatedOrders(c: string): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where({ customer_id: c })
      .orWhere({ assigned_id: c })
      .select()
  }

  async getRelatedOffers(c: string): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .where({ customer_id: c })
      .orWhere({ assigned_id: c })
      .select()
  }

  async getRelatedActiveOrders(c: string): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where("status", "!=", "fulfilled")
      .andWhere("status", "!=", "cancelled")
      .andWhere((qb) =>
        qb.where({ customer_id: c }).orWhere({ assigned_id: c }),
      )
      .orderBy("timestamp", "desc")
      .select()
  }

  async getAllThreads(): Promise<{ thread_id: number }[]> {
    return this.knex<{ thread_id: number }>("orders")
      .where("thread_id", "IS NOT", null)
      .select("thread_id")
  }

  async getServices(where: any): Promise<DBService[]> {
    return this.knex<DBService>("services").where(where).select()
  }

  async getService(where: any): Promise<DBService | undefined> {
    return this.knex<DBService>("services").where(where).first()
  }

  async getOrderComments(where: any): Promise<DBOrderComment[]> {
    return this.knex<DBOrderComment>("order_comments").where(where).select()
  }

  async getOrderReviews(where: any): Promise<DBReview[]> {
    return this.knex<DBReview>("order_reviews").where(where).select()
  }

  async getOrderReview(where: Partial<DBReview>): Promise<DBReview | null> {
    return (
      (await this.knex<DBReview>("order_reviews").where(where).first()) || null
    )
  }

  async getOrderApplicants(where: any): Promise<DBOrderApplicant[]> {
    return this.knex<DBOrderApplicant>("order_applicants").where(where).select()
  }

  async getOrderApplicantsPublicIds(
    where: any,
  ): Promise<OrderApplicantResponse[]> {
    const apps = await this.getOrderApplicants(where)
    return await Promise.all(
      apps.map(async (applicant) => ({
        ...applicant,
        user_applicant_id: undefined,
        org_applicant_id: undefined,
        user_applicant: applicant.user_applicant_id
          ? await database.getMinimalUser({
              user_id: applicant.user_applicant_id,
            })
          : null,
        org_applicant: applicant.org_applicant_id
          ? await database.getMinimalContractor({
              contractor_id: applicant.org_applicant_id,
            })
          : null,
      })),
    )
  }

  async createOrderComment(
    data: Partial<DBOrderComment>,
  ): Promise<DBOrderComment[]> {
    return this.knex<DBOrderComment>("order_comments")
      .insert(data)
      .returning("*")
  }

  async createOrderReview(data: Partial<DBReview>): Promise<DBReview[]> {
    return this.knex<DBReview>("order_reviews").insert(data).returning("*")
  }

  async createOrderApplication(data: Partial<DBOrderApplicant>): Promise<void> {
    await this.knex<DBOrderApplicant>("order_applicants").insert(data)
  }

  async getOrder(where: any): Promise<DBOrder> {
    const order = await this.knex<DBOrder>("orders").where(where).first()

    if (!order) {
      throw new Error("Invalid order!")
    }

    return order
  }

  async createOrder(data: Partial<DBOrder>): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders").insert(data).returning("*")
  }

  async createBuyOrder(data: any): Promise<DBBuyOrder[]> {
    return this.knex<DBBuyOrder>("market_buy_orders")
      .insert(data)
      .returning("*")
  }

  async updateBuyOrder(
    where: Partial<DBBuyOrder>,
    values: any,
  ): Promise<DBBuyOrder[]> {
    return this.knex<DBBuyOrder>("market_buy_orders")
      .update(values)
      .where(where)
      .returning("*")
  }

  async getBuyOrder(
    where: Partial<DBBuyOrder>,
  ): Promise<DBBuyOrder | undefined> {
    return this.knex<DBBuyOrder>("market_buy_orders").where(where).first()
  }

  async getPriceHistory(
    where: Partial<DBPriceHistory>,
  ): Promise<DBPriceHistory[]> {
    return this.knex<DBPriceHistory>("market_price_history")
      .where(where)
      .orderBy("date", "asc")
      .select()
  }

  async createService(data: Partial<DBService>): Promise<DBService[]> {
    return this.knex<DBService>("services").insert(data).returning("*")
  }

  async updateService(
    where: Partial<DBService>,
    data: Partial<DBService>,
  ): Promise<DBService[]> {
    return this.knex<DBService>("services")
      .update(data)
      .where(where)
      .returning("*")
  }

  async updateOrder(
    order_id: string,
    data: Partial<DBOrder>,
  ): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where({ order_id })
      .update(data)
      .returning("*")
  }

  async updateOffer(id: string, data: Partial<DBOffer>): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers")
      .where({ id })
      .update(data)
      .returning("*")
  }

  async updateOfferSession(
    id: string,
    data: Partial<DBOfferSession>,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .where({ id })
      .update(data)
      .returning("*")
  }

  async updateOrderOffer(
    id: string,
    data: Partial<DBOffer>,
  ): Promise<DBOffer[]> {
    const query = this.knex<DBOffer>("order_offers")
      .where({ id })
      .update(data)
      .returning("*")
    return query
  }

  async updateMarketListing(
    listing_id: string,
    data: Partial<DBMarketListing>,
  ): Promise<void> {
    await this.knex<DBMarketListing>("market_listings")
      .where({ listing_id })
      .update(data)
  }

  async updateMarketMultiple(
    multiple_id: string,
    data: Partial<DBMarketMultiple>,
  ): Promise<void> {
    await this.knex<DBMarketMultiple>("market_multiples")
      .where({ multiple_id })
      .update(data)
  }

  async clearOrderApplications(order_id: string): Promise<void> {
    await this.knex<DBOrder>("orders").where({ order_id }).delete()
  }

  async insertWebhookAction(
    data: Partial<DBWebhookActions>,
  ): Promise<DBWebhookActions[]> {
    return this.knex<DBWebhookActions>("webhook_actions")
      .insert(data)
      .returning("*")
  }

  async createNotificationWebhook(
    data: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .insert(data)
      .returning("*")
  }

  async deleteNotificationWebhook(
    where: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .delete()
      .where(where)
      .returning("*")
  }

  async getNotificationWebhooks(
    where: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .select("*")
      .where(where)
  }

  async getNotificationWebhooksByAction(
    where: any,
    action_type_name: string,
  ): Promise<DBNotificationWebhook[]> {
    const action = await this.getNotificationActionByName(action_type_name)

    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .join(
        "webhook_actions",
        "notification_webhooks.webhook_id",
        "=",
        "webhook_actions.webhook_id",
      )
      .where(where)
      .andWhere({ action_type_id: action.action_type_id })
      .select("notification_webhooks.*")
  }

  async getNotificationWebhook(
    where: any,
  ): Promise<DBNotificationWebhook | null> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .where(where)
      .first("*")
  }

  async getTransaction(where: any): Promise<DBTransaction> {
    const transaction = await this.knex<DBTransaction>("transactions")
      .where(where)
      .first()

    if (!transaction) {
      throw new Error("Invalid transaction!")
    }

    return transaction
  }

  async getTransactions(where: any): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions").where(where).select()
  }

  async getUserTransactions(user_id: string): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions")
      .where({ user_sender_id: user_id })
      .or.where({ user_recipient_id: user_id })
      .select()
  }

  async getContractorTransactions(
    contractor_id: string,
  ): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions")
      .where({ contractor_sender_id: contractor_id })
      .or.where({ contractor_recipient_id: contractor_id })
      .select()
  }

  async createTransaction(data: any): Promise<void> {
    await this.knex<DBTransaction>("transactions").insert(data)
  }

  async insertPost(postBody: PostBody): Promise<DBPost> {
    return (
      await this.knex<DBPost>("posts")
        .insert({
          user_id: postBody.user_id,
          caption: postBody.caption,
          description: postBody.description,
        })
        .returning("*")
    )[0]
  }

  async getPost(where: any) {
    const post = await this.knex<DBPost>("posts").where(where).first()

    if (!post) {
      return null
    }

    return post as DBPost
  }

  async getPostPhotos(where: any) {
    return this.knex<DBPostPhoto>("post_photos").where(where).select()
  }

  async getPostLikeCount(
    where: any,
    user_id?: string,
  ): Promise<{
    count: number
    liked?: boolean
  }> {
    // @ts-ignore
    const count: {
      CNT: string
    }[] = await this.knex<{
      CNT: string
    }>("likes")
      .where(where)
      .count("* as CNT")
      .select()

    if (!count[0]!.CNT) {
      return { count: 0, liked: false }
    } else {
      const res = { count: +count[0]!.CNT, liked: false }
      // @ts-ignore
      const liked: {
        CNT: string
      }[] = await this.knex<{
        CNT: string
      }>("likes")
        .where({ ...where, user_id: user_id })
        .count("* as CNT")
        .select()
      res.liked = !!+liked[0]!.CNT
      return res
    }
  }

  async updatePost(where: any, values: any) {
    await this.knex<DBPost>("posts").where(where).update(values)
  }

  async insertPostPhoto(post_id: string, filename: string): Promise<void> {
    await this.knex<DBPostPhoto>("post_photos").insert({
      post_id: post_id,
      filename: filename,
    })
  }

  async getChat(where: Partial<DBChat>): Promise<DBChat> {
    const chat = await this.knex<DBChat>("chats").where(where).first()

    if (!chat) {
      throw new Error("Invalid chat!")
    }

    return chat as DBChat
  }

  async updateChat(
    where: Partial<DBChat>,
    values: Partial<DBChat>,
  ): Promise<DBChat[]> {
    return this.knex<DBChat>("chats").where(where).update(values).returning("*")
  }

  async getChatParticipants(where: any): Promise<string[]> {
    const res = await this.knex<DBChatParticipant>("chat_participants")
      .where(where)
      .select()

    return res.map((r) => r.user_id)
  }

  async getMostRecentMessage(where: any): Promise<DBMessage | undefined> {
    return this.knex<DBMessage>("messages")
      .where(where)
      .orderBy("timestamp", "desc")
      .first()
  }

  getChatByParticipant(participant: string): Promise<DBChat[]> {
    return this.knex<DBChat>("chats")
      .join("chat_participants", "chats.chat_id", "chat_participants.chat_id")
      .where({
        "chat_participants.user_id": participant,
      })
      .select("chats.*")
  }

  async getMessage(where: any): Promise<DBMessage | null> {
    const message = await this.knex<DBMessage>("messages").where(where).first()

    if (!message) {
      return null
    }

    return message as DBMessage
  }

  getMessages(where: Partial<DBMessage>): Promise<DBMessage[]> {
    return this.knex<DBMessage>("messages")
      .where(where)
      .orderBy("timestamp", "ASC")
      .select("*")
  }

  async insertChat(
    participants: string[],
    order_id?: string,
    session_id?: string,
  ): Promise<DBChat> {
    const chat = (
      await this.knex<DBChat>("chats")
        .insert({ order_id, session_id })
        .returning("*")
    )[0]

    for (const participant of participants) {
      await this.knex<DBChatParticipant>("chat_participants").insert({
        chat_id: chat.chat_id,
        user_id: participant,
      })
    }

    return chat
  }

  async insertMessage(messageBody: MessageBody): Promise<DBMessage> {
    return (
      await this.knex<DBMessage>("messages").insert(messageBody).returning("*")
    )[0]
  }

  async updateMessage(where: any, values: any) {
    await this.knex<DBMessage>("messages").where(where).update(values)
  }

  async deleteMessage(where: any) {
    await this.knex<DBMessage>("messages").where(where).delete()
  }

  async getFeed(user_id: string, page: number): Promise<DBPost[]> {
    const follows = await this.knex<DBFollow>("follows")
      .where("user_id", user_id)
      .select()

    const follow_ids = (follows || []).map((item) => item.followed)
    follow_ids.push(user_id)

    return this.knex<DBPost>("posts")
      .whereRaw("user_id = ANY(?)", [follow_ids])
      .orderBy("time", "DESC")
      .limit(25)
      .offset(25 * page)
      .select("*")
  }

  async getProfilePhotos(username: string): Promise<DBPostPhoto[]> {
    const user = await this.getUser({ username: username })

    if (!user) {
      throw new Error(`Invalid user ${username}!`)
    }

    return this.knex<DBPostPhoto>("post_photos")
      .join("posts", "posts.post_id", "=", "post_photos.post_id")
      .where("posts.user_id", user.user_id)
      .select("post_photos.*")
  }

  followUser(follower: string, followed: string): Promise<void> {
    return this.knex("follows").insert({
      user_id: follower,
      followed: followed,
    })
  }

  insertLike(body: { post_id: string; user_id: string }): Promise<void> {
    return this.knex("likes").insert(body)
  }

  searchUsers(query: string): Promise<DBUser[]> {
    return this.knex<DBUser>("accounts")
      .where(this.knex.raw("username::citext"), "like", `%${query}%`)
      .or.where(this.knex.raw("display_name::citext"), "like", `%${query}%`)
      .limit(25)
      .select()
  }

  /**
   * @deprecated
   * @param query
   * @param contractor_id
   */
  searchOrgMembers(
    query: string,
    contractor_id: string,
  ): Promise<
    (DBUser & {
      role: "admin" | "owner" | "member"
    })[]
  > {
    return this.knex<
      DBUser & {
        role: "admin" | "owner" | "member"
      }
    >("accounts")
      .join(
        "contractor_members",
        "accounts.user_id",
        "=",
        "contractor_members.user_id",
      )
      .where("contractor_members.contractor_id", contractor_id)
      .where("username", "like", `%${query}%`)
      .or.where(this.knex.raw("display_name::citext"), "like", `%${query}%`)
      .select("accounts.*", "contractor_members.role")
  }

  searchContractors(query: string): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractors")
      .where(this.knex.raw("spectrum_id::citext"), "like", `%${query}%`)
      .or.where(this.knex.raw("name::citext"), "like", `%${query}%`)
      .select()
  }

  async getShips(where: any): Promise<DBShip[]> {
    return this.knex<DBShip>("ships").where(where).select()
  }

  async getShip(where: any): Promise<DBShip | undefined> {
    return this.knex<DBShip>("ships").where(where).first()
  }

  async createShip(body: any): Promise<DBShip[]> {
    return this.knex<DBShip>("ships").insert(body).returning("*")
  }

  async createDelivery(data: any): Promise<void> {
    await this.knex<DBDelivery>("deliveries").insert(data)
  }

  async getDeliveries(where: any): Promise<DBDelivery[]> {
    return this.knex<DBDelivery>("deliveries").where(where).select()
  }

  async getMarketListing(where: any): Promise<DBMarketListing> {
    const listing = await this.knex<DBMarketListing>("market_listings")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingDetails(
    where: Partial<DBMarketListingDetails>,
  ): Promise<DBMarketListingDetails> {
    const listing = await this.knex<DBMarketListingDetails>(
      "market_listing_details",
    )
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketUniqueListing(
    where: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing> {
    const listing = await this.knex<DBUniqueListing>("market_unique_listings")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingComplete(
    listing_id: string,
  ): Promise<
    | DBUniqueListingComplete
    | DBAggregateListingComplete
    | DBMultipleListingCompositeComplete
  > {
    const listing = await this.getMarketListing({ listing_id })

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    if (listing.sale_type === "aggregate") {
      return this.getMarketAggregateListingComplete(listing.listing_id)
    } else if (listing.sale_type === "multiple") {
      return this.getMarketMultipleListingComplete(listing.listing_id)
    } else {
      return this.getMarketUniqueListingComplete(listing.listing_id)
    }
  }

  async formatUniqueRaw(
    listing: DBUniqueListingRaw,
  ): Promise<DBUniqueListingComplete> {
    return {
      listing_id: listing.listing_id,
      accept_offers: listing.accept_offers,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketUniqueListingComplete(
    listing_id: string,
  ): Promise<DBUniqueListingComplete> {
    const listing: DBUniqueListingRaw = await this.knex<DBUniqueListingRaw>(
      "market_unique_listings",
    )
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_unique_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_unique_listings.listing_id", "=", listing_id)
      .first(
        "market_unique_listings.*",
        "market_listings.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
        // 'market_listings as listing',
        // 'market_listing_details as details',
      )

    if (!listing) {
      throw new Error(`Invalid listing! ${listing_id}`)
    }

    return this.formatUniqueRaw(listing)
  }

  async getMarketUniqueListingsComplete(
    where: any,
  ): Promise<DBUniqueListingComplete[]> {
    const listings = await this.knex<DBUniqueListingRaw>(
      "market_unique_listings",
    )
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_unique_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where(where)
      .select(
        "*",
        // 'market_listings as listing',
        // 'market_listing_details as details',
      )

    return Promise.all(listings.map((listing) => this.formatUniqueRaw(listing)))
  }

  async getListingsByGameItemID(
    game_item_id: string,
    listing_where: any,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "market_unique_listings",
        "market_unique_listings.listing_id",
        "=",
        "market_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .where("market_listing_details.game_item_id", "=", game_item_id)
      .andWhere(listing_where)
      .select()
  }

  async getBuyOrdersByGameItemID(
    game_item_id: string,
    historic = false,
  ): Promise<DBBuyOrder[]> {
    const base = this.knex<DBBuyOrder>("market_buy_orders").where({
      game_item_id,
    })

    if (historic) {
      return base.select()
    } else {
      return base
        .andWhere("expiry", ">", this.knex.fn.now())
        .andWhere("fulfilled_timestamp", null)
    }
  }

  async formatAggregateRaw(
    listing: DBAggregateRaw,
    listing_where: any,
  ): Promise<DBAggregateComplete> {
    const listings = await this.getListingsByGameItemID(
      listing.game_item_id,
      listing_where,
    )
    const buy_orders = await this.getBuyOrdersByGameItemID(
      listing.game_item_id,
      false,
    )

    return {
      game_item_id: listing.game_item_id,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listings,
      buy_orders,
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketAggregateComplete(
    game_item_id: string,
    listing_where: any,
  ): Promise<DBAggregateComplete> {
    const listing: DBAggregateRaw = await this.knex<DBAggregateRaw>(
      "game_items",
    )
      // .join('market_listings', 'market_listings.listing_id', '=', 'market_aggregate_listings.aggregate_listing_id')
      .join(
        "market_listing_details",
        "game_items.details_id",
        "=",
        "market_listing_details.details_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("game_items.id", "=", game_item_id)
      .first(
        "game_items.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatAggregateRaw(listing, listing_where)
  }

  async getMarketAggregatesComplete(
    where: any,
    listing_where: any,
    has_listings: boolean = false,
    has_buy_orders: boolean = false,
  ): Promise<DBAggregateComplete[]> {
    let listings = this.knex<DBAggregateRaw>("game_items").join(
      "market_listing_details",
      "game_items.details_id",
      "=",
      "market_listing_details.details_id",
    )
    if (has_listings) {
      listings = listings.where((pred) =>
        pred.whereExists(
          this.knex("market_unique_listings")
            .where(
              "market_unique_listings.details_id",
              "=",
              this.knex.raw("market_listing_details.details_id"),
            )
            .select(),
        ),
      )
    } else if (has_buy_orders) {
      listings = listings.where((pred) =>
        pred.whereExists(
          this.knex("market_buy_orders")
            .where(
              "market_buy_orders.game_item_id",
              "=",
              this.knex.raw("game_items.id"),
            )
            .select(),
        ),
      )
    }
    // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
    listings = listings.andWhere(where).select("*")

    return Promise.all(
      (await listings).map((listing) =>
        this.formatAggregateRaw(listing, listing_where),
      ),
    )
  }

  async getMarketBuyOrdersComplete() {
    const q = this.knex<DBAggregateRaw>("game_items")
      .join(
        "market_listing_details",
        "game_items.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .whereExists(
        this.knex("market_buy_orders")
          .where(
            "market_buy_orders.game_item_id",
            "=",
            this.knex.raw("game_items.id"),
          )
          .select(),
      )

    return Promise.all(
      (await q).map((listing) =>
        this.formatAggregateRaw(listing, { status: "active" }),
      ),
    )
  }

  async formatAggregateListingRaw(
    listing: DBAggregateListingRaw,
  ): Promise<DBAggregateListingComplete> {
    return {
      aggregate: {
        game_item_id: listing.game_item_id,
        details_id: listing.details_id,
      },
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketAggregateListingComplete(
    listing_id: string,
  ): Promise<DBAggregateListingComplete> {
    const listing: DBAggregateListingRaw =
      await this.knex<DBAggregateListingRaw>("market_listings")
        .join(
          "market_unique_listings",
          "market_listings.listing_id",
          "=",
          "market_unique_listings.listing_id",
        )
        .join(
          "market_listing_details",
          "market_aggregates.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
        .where("market_listings.listing_id", "=", listing_id)
        .first(
          "market_listings.*",
          "market_unique_listings.*",
          "market_listing_details.*",
          this.knex.ref("game_items.name").as("item_name"),
        )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatAggregateListingRaw(listing)
  }

  async formatMultipleRaw(
    listing: DBMultipleRaw,
    listing_where: any,
  ): Promise<DBMultipleComplete> {
    const listings = await this.getMarketMultipleListingsComplete({
      "market_multiples.multiple_id": listing.multiple_id,
      ...listing_where,
    })

    return {
      contractor_seller_id: listing.contractor_seller_id,
      default_listing: listings.find(
        (l) => l.listing.listing_id === listing.default_listing_id,
      )!,
      default_listing_id: listing.default_listing_id,
      user_seller_id: listing.user_seller_id,
      multiple_id: listing.multiple_id,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listings,
    }
  }

  async getMarketMultipleComplete(
    multiple_id: string,
    listing_where: any,
  ): Promise<DBMultipleComplete> {
    const listing: DBMultipleRaw = await this.knex<DBMultipleRaw>(
      "market_multiples",
    )
      // .join('market_listings', 'market_listings.listing_id', '=', 'market_aggregate_listings.aggregate_listing_id')
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_multiples.multiple_id", "=", multiple_id)
      .first(
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatMultipleRaw(listing, listing_where)
  }

  async getMarketMultiplesComplete(
    where: any,
    listing_where: any,
    has_listings: boolean = false,
  ): Promise<DBMultipleComplete[]> {
    let listings
    if (has_listings) {
      listings = await this.knex<DBMultipleRaw>("market_multiples")
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        .where(where)
        .select(
          "market_multiples.*",
          "market_listing_details.*",
          this.knex.ref("game_items.name").as("item_name"),
        )
    } else {
      listings = await this.knex<DBMultipleRaw>("market_multiples")
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
        .whereExists(
          this.knex("market_multiple_listings")
            .where(
              "market_multiple_listings.multiple_id",
              "=",
              this.knex.raw("market_multiples.multiple_id"),
            )
            .select("*", this.knex.ref("game_items.name").as("item_name")),
        )
        .where(where)
        .select("*")
    }

    return Promise.all(
      listings.map((listing) => this.formatMultipleRaw(listing, listing_where)),
    )
  }

  async formatMultipleListingRaw(
    listing: DBMultipleListingRaw,
  ): Promise<DBMultipleListingCompositeComplete> {
    return {
      multiple: {
        multiple_id: listing.multiple_id,
        details_id: listing.multiple_details_id,
        default_listing_id: listing.default_listing_id,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
      },
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketMultipleListingComplete(
    listing_id: string,
  ): Promise<DBMultipleListingCompositeComplete> {
    const listing: DBMultipleListingRaw = await this.knex<DBMultipleListingRaw>(
      "market_listings",
    )
      .join(
        "market_multiple_listings",
        "market_listings.listing_id",
        "=",
        "market_multiple_listings.multiple_listing_id",
      )
      .join(
        "market_multiples",
        "market_multiples.multiple_id",
        "=",
        "market_multiple_listings.multiple_id",
      )
      .join(
        "market_listing_details",
        "market_multiple_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_listings.listing_id", "=", listing_id)
      .first(
        "market_listings.*",
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
        this.knex.ref("market_multiple_listings.details_id").as("details_id"),
        this.knex.ref("market_multiples.details_id").as("multiple_details_id"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatMultipleListingRaw(listing)
  }

  async getMarketMultipleListingsComplete(
    where: any,
  ): Promise<DBMultipleListingCompositeComplete[]> {
    const listings = await this.knex<DBMultipleListingRaw>("market_listings")
      .join(
        "market_multiple_listings",
        "market_listings.listing_id",
        "=",
        "market_multiple_listings.multiple_listing_id",
      )
      .join(
        "market_multiples",
        "market_multiples.multiple_id",
        "=",
        "market_multiple_listings.multiple_id",
      )
      .join(
        "market_listing_details",
        "market_multiple_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where(where)
      .select(
        "market_listings.*",
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("market_multiple_listings.details_id").as("details_id"),
        this.knex.ref("market_multiples.details_id").as("multiple_details_id"),
        this.knex.ref("game_items.name").as("item_name"),
      )

    return Promise.all(
      listings.map((listing) => this.formatMultipleListingRaw(listing)),
    )
  }

  async getMarketOffers(where: any): Promise<DBMarketOffer[]> {
    return this.knex<DBMarketOffer>("market_offers").where(where).select()
  }

  async removeMarketOffers(where: any): Promise<DBMarketOffer[]> {
    return this.knex<DBMarketOffer>("market_offers")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeMarketOfferListings(where: any): Promise<DBMarketOfferListing[]> {
    return this.knex<DBMarketOfferListing>("market_offer_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMarketBids(where: any): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids").where(where).select()
  }

  async getAuctionDetail(where: any): Promise<DBAuctionDetails | undefined> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .first()
  }

  async getAuctionDetails(where: any): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .select()
  }

  async createAuctionDetails(values: any): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .insert(values)
      .returning("*")
  }

  async updateAuctionDetails(
    where: any,
    values: any,
  ): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .update(values)
  }

  async getExpiringMarketListings(): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where("expiration", "<=", this.knex.raw("now()"))
      .andWhere("status", "active")
      .select()
  }

  async getExpiringAuctions(): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where("end_time", "<=", this.knex.raw("now()"))
      .select()
  }

  async removeMarketBids(where: any): Promise<DBMarketBid[]> {
    const bids = await this.knex<DBMarketBid>("market_bids")
      .where(where)
      .delete()
      .returning("*")

    const action = await this.getNotificationActionByName("market_item_bid")
    for (const bid of bids) {
      await this.removeNotificationObjects({
        entity_id: bid.bid_id,
        action_type_id: action.action_type_id,
      })
    }

    return bids
  }

  async getMarketOrder(where: any): Promise<DBMarketListing> {
    const listing = await this.knex<DBMarketListing>("market_orders")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingImages(
    where: Partial<DBMarketListingImage>,
  ): Promise<DBMarketListingImage[]> {
    return this.knex<DBMarketListingImage>("market_images")
      .where(where)
      .select()
  }

  async getServiceListingImages(
    where: Partial<DBServiceImage>,
  ): Promise<DBServiceImage[]> {
    return this.knex<DBServiceImage>("service_images").where(where).select()
  }

  async getMarketListingImagesResolved(
    where: Partial<DBMarketListingImage>,
  ): Promise<string[]> {
    const images = await this.getMarketListingImages(where)
    const urls = await Promise.all(
      images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
    )
    return urls.filter((x) => x) as string[]
  }

  async getServiceListingImagesResolved(
    where: Partial<DBServiceImage>,
  ): Promise<string[]> {
    const images = await this.getServiceListingImages(where)
    const urls = await Promise.all(
      images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
    )
    return urls.filter((x) => x) as string[]
  }

  async getMarketListingImagesByListingID(
    listing: DBMarketListing,
  ): Promise<DBMarketListingImage[]> {
    if (listing.sale_type === "aggregate") {
      const complete = await this.getMarketAggregateListingComplete(
        listing.listing_id,
      )
      return complete.images
    } else {
      const complete = await this.getMarketUniqueListingComplete(
        listing.listing_id,
      )
      return complete.images
    }
  }

  async deleteMarketListingImages(
    where: Partial<DBMarketListingImage>,
  ): Promise<DBMarketListingImage[]> {
    return this.knex<DBMarketListingImage>("market_images")
      .where(where)
      .delete()
      .returning("*")
  }

  async deleteServiceImages(
    where: Partial<DBServiceImage>,
  ): Promise<DBServiceImage[]> {
    return this.knex<DBServiceImage>("service_images")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMarketListingOrders(
    where: Partial<DBMarketOrder>,
  ): Promise<DBMarketOrder[]> {
    return this.knex<DBMarketOrder>("market_orders").where(where).select()
  }

  async insertMarketListingOrder(
    data: Partial<DBMarketOrder>,
  ): Promise<DBMarketOrder[]> {
    return this.knex<DBMarketOrder>("market_orders").insert(data).returning("*")
  }

  async insertOfferMarketListing(
    data: Partial<DBOfferMarketListing> | Partial<DBOfferMarketListing>[],
  ): Promise<DBOfferMarketListing[]> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .insert(data)
      .returning("*")
  }

  async getOfferMarketListings(
    offer_id: string,
  ): Promise<DBOfferMarketListing[]> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .where({ offer_id })
      .select()
  }

  async getOfferMarketListingCount(offer_id: string): Promise<{ sum: number }> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .where({ offer_id })
      .first(this.knex.raw("COALESCE(SUM(quantity), 0) as sum"))
  }

  async getOrderMarketListingCount(order_id: string): Promise<{ sum: number }> {
    return this.knex<DBMarketOrder>("market_orders")
      .where({ order_id })
      .first(this.knex.raw("COALESCE(SUM(quantity), 0) as sum"))
  }

  async getOfferSessions(
    where: Partial<DBOfferSession>,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions").where(where).select()
  }

  async getUserMarketListings(user_id: string): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "accounts",
        "accounts.user_id",
        "=",
        "market_listings.user_seller_id",
      )
      .where({ user_seller_id: user_id })
      .select("market_listings.*")
  }

  async getPublicMarketListings(): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where({ status: "active", internal: false })
      .select("market_listings.*")
  }

  async getMarketListings(
    where: Partial<DBMarketListing>,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where(where)
      .select("market_listings.*")
  }

  async getMarketAggregates(
    where: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .select("market_aggregates.*")
  }

  async getMarketAggregate(
    where: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate | undefined> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .first()
  }

  async getMarketAggregateListings(
    where: any,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where(where)
      .select("*")
  }

  async updateMarketAggregateListing(
    aggregate_id: string,
    data: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .where({ aggregate_id })
      .update(data)
      .returning("*")
  }

  async getMarketAggregateListing(
    where: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .where(where)
      .first()
  }

  async createMarketMultiple(
    body: Partial<DBMarketMultiple> | Partial<DBMarketMultiple>[],
  ) {
    return this.knex<DBMarketMultiple>("market_multiples")
      .insert(body)
      .returning("*")
  }

  async createMarketMultipleListing(
    body: Partial<DBMarketMultipleListing> | Partial<DBMarketMultipleListing>[],
  ) {
    return this.knex<DBMarketMultipleListing>("market_multiple_listings")
      .insert(body)
      .returning("*")
  }

  async getMarketAggregateListingByUser(
    aggregate_id: string,
    user_seller_id: string,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where({ user_seller_id, aggregate_id })
      .andWhere("status", "!=", "archived")
      .first()
  }

  async getMarketAggregateListingByContractor(
    aggregate_id: string,
    contractor_seller_id: string,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where({ contractor_seller_id, aggregate_id })
      .andWhere("status", "!=", "archived")
      .first()
  }

  async insertMarketAggregate(
    body: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .insert(body)
      .returning("*")
  }

  async updateMarketAggregate(
    where: Partial<DBMarketAggregate>,
    values: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .update(values)
      .returning("*")
  }

  async insertMarketAggregateListing(
    body: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .insert(body)
      .returning("*")
  }

  async getContractorMarketListings(where: any): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "market_listings.contractor_seller_id",
      )
      .where(where)
      .select("market_listings.*")
  }

  async createMarketListing(
    body: Partial<DBMarketListing>,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .insert(body)
      .returning("*")
  }

  async createUniqueListing(
    body: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing[]> {
    return this.knex<DBUniqueListing>("market_unique_listings")
      .insert(body)
      .returning("*")
  }

  async removeUniqueListing(
    where: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing[]> {
    return this.knex<DBUniqueListing>("market_unique_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeMultipleListing(
    where: Partial<DBMarketMultipleListing>,
  ): Promise<DBMarketMultipleListing[]> {
    return this.knex<DBMarketMultipleListing>("market_multiple_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async createListingDetails(
    body: Partial<DBMarketListingDetailsBase>,
  ): Promise<DBMarketListingDetails[]> {
    return this.knex<DBMarketListingDetails>("market_listing_details")
      .insert(body)
      .returning("*")
  }

  async updateListingDetails(
    where: Partial<DBMarketListingDetails>,
    values: Partial<DBMarketListingDetails>,
  ): Promise<DBMarketListingDetails[]> {
    return this.knex<DBMarketListingDetails>("market_listing_details")
      .where(where)
      .update(values)
      .returning("*")
  }

  async createMarketBid(data: Partial<DBMarketBid>): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids").insert(data).returning("*")
  }

  async deleteMarketBids(where: any): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids")
      .where(where)
      .delete()
      .returning("*")
  }

  async createOrderOfferSession(
    data: Partial<DBOfferSession>,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .insert(data)
      .returning("*")
  }

  async createOrderOffer(data: Partial<DBOffer>): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers").insert(data).returning("*")
  }

  async insertMarketDetailsPhoto(value: Partial<DBMarketListingImage>) {
    return this.knex<DBMarketListingImage>("market_images")
      .insert(value)
      .returning("*")
  }

  async insertMarketListingPhoto(
    listing: DBMarketListing,
    items: {
      resource_id?: string
      aggregate_id?: string
    }[],
  ) {
    const unique = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return this.knex<DBMarketListingImage>("market_images")
      .insert(
        items.map((o) => ({ ...o, details_id: unique.details.details_id })),
      )
      .returning("*")
  }

  async insertServiceImage(body: DBServiceImage) {
    return this.knex<DBServiceImage>("service_images")
      .insert(body)
      .returning("*")
  }

  // Notifications
  async insertNotificationObjects(items: any[]) {
    return this.knex<DBNotificationObject>("notification_object")
      .insert(items)
      .returning("*")
  }

  async removeNotificationObjects(where: any) {
    return this.knex<DBNotificationObject>("notification_object")
      .where(where)
      .delete()
      .returning("*")
  }

  async insertNotifications(items: any[]) {
    return this.knex<DBNotification>("notification")
      .insert(items)
      .returning("*")
  }

  async insertNotificationChange(items: any[]) {
    return this.knex<DBNotificationChange>("notification_change")
      .insert(items)
      .returning("*")
  }

  async getNotifications(where: any) {
    return this.knex<DBNotification>("notification").select("*").where(where)
  }

  async updateNotifications(where: any, values: any) {
    return this.knex<DBNotification>("notification").update(values).where(where)
  }

  async deleteNotifications(where: any) {
    return this.knex<DBNotification>("notification")
      .where(where)
      .delete()
      .returning("*")
  }

  async getNotificationObject(where: any) {
    return this.knex<DBNotificationObject>("notification_object")
      .select("*")
      .where(where)
  }

  async getNotificationAction(where: any): Promise<DBNotificationActions[]> {
    return this.knex<DBNotificationActions>("notification_actions")
      .select("*")
      .where(where)
  }

  async getNotificationChange(where: any) {
    return this.knex<DBNotificationChange>("notification_change")
      .select("*")
      .where(where)
  }

  async getEntityByType(entity_type: string, entity_id: string) {
    let order
    switch (entity_type) {
      case "orders":
        order = await this.getOrder({ order_id: entity_id })
        return serializeOrderDetails(order, null)
      case "order_reviews": {
        const review = await this.getOrderReview({ review_id: entity_id })
        order = await this.getOrder({ order_id: review?.order_id })
        return await formatReview(order)
      }
      case "contractors":
        return await this.getMinimalContractor({ contractor_id: entity_id })
      case "market_listing": {
        const listing = await this.getMarketListing({ listing_id: entity_id })
        return await formatListing(listing)
      }
      case "contractor_invites": {
        const invite = await this.getContractorInvite({ invite_id: entity_id })
        return await formatInvite(invite!)
      }
      case "market_bids": {
        const bids = await this.getMarketBids({ bid_id: entity_id })
        return await formatBid(bids[0])
      }
      case "offer_sessions": {
        const [offers] = await this.getOfferSessions({ id: entity_id })
        return await serializeOfferSession(offers)
      }
      // case 'recruiting_comment_reply':
      //     const offers = await this.getMarketOffers({offer_id: entity_id})
      //     return await formatComment(offers[0])
      default:
        throw Error(`Invalid entity type ${entity_type}`)
    }
  }

  async getCompleteNotificationsByUser(user_id: string) {
    const notifs = await this.getNotifications({ notifier_id: user_id })
    const complete_notifs = []
    for (const notif of notifs) {
      const notif_object = await this.getNotificationObject({
        notification_object_id: notif.notification_object_id,
      })
      const notif_action = await this.getNotificationAction({
        action_type_id: notif_object[0].action_type_id,
      })
      const notif_change = await this.getNotificationChange({
        notification_object_id: notif.notification_object_id,
      })
      const actors = await Promise.all(
        notif_change.map((c) => this.getMinimalUser({ user_id: c.actor_id })),
      )

      let entity
      try {
        entity = await this.getEntityByType(
          notif_action[0].entity,
          notif_object[0].entity_id,
        )
      } catch (e) {
        // console.error(e)
        continue
      }
      complete_notifs.push({
        read: notif.read,
        notification_id: notif.notification_id,
        action: notif_action[0].action,
        actors: actors,
        entity_type: notif_action[0].entity,
        entity: entity,
        timestamp: notif_object[0].timestamp,
      })
    }

    complete_notifs.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    )

    return complete_notifs
  }

  async getNotificationActionByName(
    name: string,
  ): Promise<DBNotificationActions> {
    const result = await this.knex<DBNotificationActions>(
      "notification_actions",
    )
      .where({ action: name })
      .first()

    return result!
  }

  async getAllRecruitingPosts() {
    return this.knex<DBRecruitingPost>("recruiting_posts").select()
  }

  async getAllRecruitingPostsPaginated(searchQuery: RecruitingSearchQuery) {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBRecruitingPost>("recruiting_posts")

    switch (searchQuery.sorting) {
      case "name":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy("contractors.name", searchQuery.reverseSort ? "asc" : "desc")
        break
      case "rating":
        query = query.orderBy(
          // @ts-ignore
          this.knex.raw(
            "get_total_rating(null, recruiting_posts.contractor_id)",
          ),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "members":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy(
            this.knex.select(knex.raw(`contractors.size::integer`)),
            searchQuery.reverseSort ? "asc" : "desc",
          )
        break
      case "activity":
        query = query.orderBy(
          database
            .knex("recruiting_votes")
            .where(
              "recruiting_votes.post_id",
              "=",
              database.knex.raw("recruiting_posts.post_id"),
            )
            .andWhere(
              "recruiting_votes.timestamp",
              ">",
              this.knex.raw("now() - INTERVAL '1 month'"),
            )
            .count(),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "all-time":
        query = query.orderBy(
          database
            .knex("recruiting_votes")
            .where(
              "recruiting_votes.post_id",
              "=",
              database.knex.raw("recruiting_posts.post_id"),
            )
            .count(),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "date":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy(
            "contractors.created_at",
            searchQuery.reverseSort ? "asc" : "desc",
          )
        break
      case "post-date":
        query = query.orderBy(
          "recruiting_posts.timestamp",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      default:
        return []
    }

    if (searchQuery.rating) {
      query = query.where(
        "get_avg_rating(null, recruiting_posts.contractor_id)",
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = recruiting_posts.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where(
          knex.raw("LOWER(body)"),
          "LIKE",
          "%" + searchQuery.query + "%",
        ).orWhere(
          knex.raw("LOWER(title)"),
          "LIKE",
          "%" + searchQuery.query + "%",
        )
      })
    }

    return query
      .limit(searchQuery.pageSize)
      .offset(searchQuery.pageSize * searchQuery.index)
      .select()
  }

  async getAllContractorsPaginated(
    searchQuery: RecruitingSearchQuery,
  ): Promise<DBContractor[]> {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBContractor>("contractors")

    switch (searchQuery.sorting) {
      case "name":
        query = query.orderBy(
          "contractors.name",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "date":
        query = query.orderBy(
          "contractors.created_at",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "rating":
        query = query.orderBy(
          // @ts-ignore
          this.knex.raw("get_total_rating(null, contractors.contractor_id)"),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "members":
        query = query.orderBy("size", searchQuery.reverseSort ? "asc" : "desc")
        break
      default:
        return []
    }

    if (searchQuery.rating) {
      query = query.where(
        "get_average_rating(null, contractors.contractor_id)",
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where(
          knex.raw("LOWER(description)"),
          "LIKE",
          "%" + searchQuery.query + "%",
        )
          .orWhere(
            knex.raw("LOWER(name)"),
            "LIKE",
            "%" + searchQuery.query + "%",
          )
          .orWhere(
            knex.raw("LOWER(spectrum_id)"),
            "LIKE",
            "%" + searchQuery.query + "%",
          )
      })
    }

    return query
      .limit(searchQuery.pageSize)
      .offset(searchQuery.pageSize * searchQuery.index)
      .select()
  }

  async getAllContractorsCount(searchQuery: RecruitingSearchQuery): Promise<
    {
      count: number
    }[]
  > {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBContractor>("contractors")

    if (searchQuery.rating) {
      query = query.where(
        "get_average_rating(null, orders.contractor_id)",
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where(
          knex.raw("LOWER(description)"),
          "LIKE",
          "%" + searchQuery.query + "%",
        )
          .orWhere(
            knex.raw("LOWER(name)"),
            "LIKE",
            "%" + searchQuery.query + "%",
          )
          .orWhere(
            knex.raw("LOWER(spectrum_id)"),
            "LIKE",
            "%" + searchQuery.query + "%",
          )
      })
    }

    return query.count()
  }

  async getRecruitingPostCount() {
    return this.knex<{
      count: number
    }>("recruiting_posts").count()
  }

  async getContractorCount(where: any) {
    return this.knex<{
      count: number
    }>("contractors")
      .where(where)
      .count()
  }

  async getRecruitingPost(where: any) {
    return this.knex<DBRecruitingPost>("recruiting_posts").where(where).first()
  }

  async updateRecruitingPost(where: any, values: any) {
    return this.knex<DBRecruitingPost>("recruiting_posts")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getRecruitingPostComments(where: any) {
    return this.knex<DBComment>("comments")
      .join(
        "recruiting_comments",
        "comments.comment_id",
        "=",
        "recruiting_comments.comment_id",
      )
      .where(where)
      .select()
  }

  async insertRecruitingComment(values: any) {
    return this.knex<{
      comment_id: string
      post_id: string
    }>("recruiting_comments").insert(values)
  }

  async insertComment(values: any) {
    return this.knex<DBComment>("comments").insert(values).returning("*")
  }

  async deleteComments(where: any) {
    return this.knex<DBComment>("comments").where(where).delete().returning("*")
  }

  async updateComments(where: any, values: any) {
    return this.knex<DBComment>("comments")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getComments(where: Partial<DBComment>) {
    return this.knex<DBComment>("comments").where(where).select()
  }

  async getComment(where: any) {
    return this.knex<DBComment>("comments").where(where).first()
  }

  async getCommentVoteCounts(where: any) {
    return this.knex<
      {
        upvote: string
        count: number
      }[]
    >("comment_votes")
      .where(where)
      .groupBy("upvote")
      .count()
      .select("upvote")
  }

  async getCommentVote(where: any) {
    return this.knex<DBCommentVote>("comment_votes").where(where).first()
  }

  async addCommentVote(values: any) {
    return this.knex<DBCommentVote>("comment_votes")
      .insert(values)
      .returning("*")
  }

  async removeCommentVote(where: any) {
    return this.knex<DBCommentVote>("comment_votes").where(where).delete()
  }

  async getRecruitingPostVoteCounts(where: any) {
    return this.knex<{
      upvote: string
      count: number
    }>("recruiting_votes")
      .where(where)
      .groupBy("upvote")
      .count()
      .select("upvote")
  }

  async addRecruitingPostVote(values: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .insert(values)
      .returning("*")
  }

  async removeRecruitingPostVote(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeRecruitingPostVoteLimit(where: any, limit: number) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .delete()
      .limit(limit)
      .returning("*")
  }

  async getRecruitingPostVote(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes").where(where).first()
  }

  async getRecruitingPostVoteWithinWeek(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .where("timestamp", ">", this.knex.raw("now() - INTERVAL '1 week'"))
      .first()
  }

  async getUserSettings(user_id: string) {
    let settings = await this.knex<DBAccountSettings>("account_settings")
      .where({ user_id })
      .first()

    if (!settings) {
      settings = (
        await this.knex<DBAccountSettings>("account_settings")
          .insert({ user_id })
          .returning("*")
      )[0]
    }

    return settings
  }

  async getUserAvailability(user_id: string, contractor_id: string | null) {
    const availability = await this.knex<DBAvailabilityEntry>(
      "user_availability",
    )
      .where({ user_id })
      .andWhere("contractor_id", contractor_id)
      .select()

    if (!availability) {
      return []
    }

    return availability
  }

  async updateUserAvailability(
    user_id: string,
    contractor_id: string | null,
    spans: AvailabilitySpan[],
  ) {
    const entries: DBAvailabilityEntry[] = spans.map((s) => ({
      user_id,
      contractor_id,
      start: s.start,
      finish: s.finish,
    }))

    await this.knex<DBAvailabilityEntry>("user_availability")
      .where({ user_id, contractor_id })
      .delete()

    return this.knex<DBAvailabilityEntry>("user_availability").insert(entries)
  }

  async updateUserSettings(user_id: string, settings: any) {
    return this.knex<DBAccountSettings>("account_settings")
      .where({ user_id })
      .update(settings)
      .returning("*")
  }

  async rebuildMarket() {
    await this.knex.schema.refreshMaterializedView("market_search_materialized")
  }

  async updatePriceHistpry() {
    await this.knex.raw("CALL upsert_daily_price_history()")
  }

  async searchMarket(searchQuery: MarketSearchQuery, andWhere?: any) {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBMarketSearchResult>(
      "market_search_materialized",
    ).orderBy(searchQuery.sort, searchQuery.reverseSort ? "asc" : "desc")

    if (searchQuery.sale_type) {
      query = query.where({
        sale_type: searchQuery.sale_type || undefined,
      })
    }

    if (searchQuery.item_type) {
      query = query.andWhere(
        knex.raw(
          "to_tsquery('simple', COALESCE(websearch_to_tsquery('english', ?)::text, ':*'))",
          searchQuery.item_type,
        ),
        "@@",
        knex.raw("item_type_ts"),
      )
    }

    if (searchQuery.minCost) {
      query = query.andWhere("minimum_price", ">=", searchQuery.minCost)
    }

    if (searchQuery.maxCost) {
      query = query.andWhere("maximum_price", "<=", searchQuery.maxCost)
    }

    if (searchQuery.quantityAvailable) {
      query = query.andWhere(
        "quantity_available",
        ">=",
        searchQuery.quantityAvailable,
      )
    }

    if (searchQuery.rating) {
      query = query.andWhere("avg_rating", ">", searchQuery.seller_rating)
    }

    if (searchQuery.query) {
      // to_tsquery('simple', websearch_to_tsquery('english', ?)::text || ':*')
      query = query
        .andWhere(
          knex.raw("websearch_to_tsquery('english', ?)", searchQuery.query),
          "@@",
          knex.raw("textsearch"),
        )
        .orderBy(
          // @ts-ignore
          knex.raw(
            "ts_rank_cd(textsearch, websearch_to_tsquery('english', ?))",
            searchQuery.query,
          ),
          "desc",
        )
    }

    if (searchQuery.listing_type) {
      if (searchQuery.listing_type === "not-aggregate") {
        query = query.andWhere("listing_type", "!=", "aggregate")
      } else {
        query = query.andWhere("listing_type", searchQuery.listing_type)
      }
    }

    if (searchQuery.user_seller_id) {
      query = query.andWhere("user_seller_id", searchQuery.user_seller_id)
    }

    if (searchQuery.contractor_seller_id) {
      query = query.andWhere(
        "contractor_seller_id",
        searchQuery.contractor_seller_id,
      )
    }

    if (andWhere) {
      query = query.andWhere(andWhere)
    }

    if (searchQuery.page_size) {
      query = query
        .limit(searchQuery.page_size)
        .offset(searchQuery.page_size * searchQuery.index)
    }

    return query.select("*", knex.raw("count(*) OVER() AS full_count"))
  }

  async getOrderStats() {
    const order_stats = await this.knex<OrderStats>("order_stats").first()

    const order_week_stats = await this.knex<{
      week_orders: number
      week_order_value: number
    }>("order_week_stats").first()

    return {
      ...order_stats,
      ...order_week_stats,
    }
  }

  async upsertDailyActivity(user_id: string) {
    try {
      await this.knex.raw("CALL upsert_daily_activity(?)", [user_id])
    } catch (e) {
      console.error(e)
    }
  }

  async getDailyActivity() {
    return this.knex<{ date: Date; count: number }>("daily_activity")
      .orderBy("date", "ASC")
      .select()
  }

  async getWeeklyActivity() {
    return this.knex<{ date: Date; count: number }>("weekly_activity")
      .orderBy("date", "ASC")
      .select()
  }

  async getMonthlyActivity() {
    return this.knex<{ date: Date; count: number }>("monthly_activity")
      .orderBy("date", "ASC")
      .select()
  }

  async getMarketItemsByCategory(category: string): Promise<DBMarketItem[]> {
    return this.knex<DBMarketItem>("game_items")
      .join(
        "game_item_categories",
        "game_item_categories.subcategory",
        "game_items.type",
      )
      .where("category", category)
      .orderBy("name")
      .select("name", "type")
  }

  async getMarketItemsBySubcategory(
    subcategory: string,
  ): Promise<DBMarketItem[]> {
    return this.knex<DBMarketItem>("game_items")
      .where("type", subcategory)
      .orderBy("name")
      .select("name", "type", "id")
  }

  async getMarketCategories(): Promise<DBMarketCategory[]> {
    return this.knex<DBMarketCategory>("game_item_categories")
      .orderBy("category")
      .orderBy("game_item_categories")
      .select()
  }

  async getGameItem(where: Partial<DBMarketItem>) {
    return this.knex<DBMarketItem>("game_items").where(where).first()
  }

  async getMostRecentOrderOffer(id: string): Promise<DBOffer> {
    const res = await this.knex<DBOffer>("order_offers")
      .where({ session_id: id })
      .orderBy("timestamp", "desc")
      .first()

    return res!
  }

  async getOrderOffers(where: Partial<DBOffer>): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers")
      .where(where)
      .orderBy("timestamp", "desc")
      .select()
  }

  async getPublicContract(
    where: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts").where(where).select()
  }

  async deletePublicContract(
    where: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts")
      .where(where)
      .delete()
      .returning("*")
  }

  async updatePublicContract(
    where: Partial<DBPublicContract>,
    data: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts")
      .where(where)
      .update(data)
      .returning("*")
  }

  async insertPublicContract(
    data: Partial<DBPublicContract> | Partial<DBPublicContract>[],
  ) {
    return this.knex<DBPublicContract>("public_contracts")
      .insert(data)
      .returning("*")
  }

  async getContractOffers(
    where: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .select()
  }

  async deleteContractOffers(
    where: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .delete()
      .returning("*")
  }

  async updateContractOffers(
    where: Partial<DBContractOffer>,
    data: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .update(data)
      .returning("*")
  }

  async insertContractOffers(
    data: Partial<DBContractOffer> | Partial<DBContractOffer>[],
  ) {
    return this.knex<DBContractOffer>("public_contract_offers")
      .insert(data)
      .returning("*")
  }
}

export const database = new KnexDatabase()
