import express from "express"
import {
  adminAuthorized,
  userAuthorized,
  verifiedUser,
} from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn, external_resource_regex } from "../../../../clients/cdn/cdn.js"
import { Contractor, User } from "../api-models.js"
import { DBContractor } from "../../../../clients/database/db-models.js"
import { contractorDetails } from "../util/formatting.js"
import { createContractorInviteNotification } from "../util/notifications.js"
import { createNotificationWebhook } from "../util/webhooks.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"
import { convertQuery } from "../recruiting/recruiting.js"
import {
  can_manage_role,
  get_min_position,
  has_permission,
  is_member,
  outranks,
} from "../util/permissions.js"
import { authorizeProfile } from "../profiles/helpers.js"
import { fetchChannel, fetchGuild } from "../util/discord.js"
import { authorizeContractor, createContractor } from "./helpers.js"
import { fetchRSIOrgSCAPI } from "../../../../clients/scapi/scapi.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response409,
} from "../openapi.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { org_permission, valid_contractor } from "./middleware.js"

export const contractorsRouter = express.Router()

const VALID_ORG_TAGS = [
  "combat",
  "freight",
  "refuel",
  "repair",
  "mining",
  "transport",
  "exploration",
  "escort",
  "salvage",
  "refining",
  "construction",
  "social",
  "roleplay",
  "medical",
  "intelligence",
]

oapi.schema("ContractorInviteCode", {
  properties: {
    invite_id: {
      title: "ContractorInviteCode.invite_id",
      type: "string",
    },
    max_uses: {
      title: "ContractorInviteCode.max_uses",
      type: "integer",
      minimum: 0,
    },
    times_used: {
      title: "ContractorInviteCode.times_used",
      type: "integer",
      minimum: 0,
    },
  },
  required: ["invite_id", "max_uses", "times_used"],
  additionalProperties: false,
  title: "ContractorInviteCode",
  type: "object",
})

oapi.schema("ContractorRole", {
  properties: {
    contractor_id: {
      title: "ContractorRole.contractor_id",
      type: "string",
    },
    name: {
      title: "ContractorRole.name",
      type: "string",
      minLength: 3,
    },
    position: {
      title: "ContractorRole.position",
      type: "integer",
      minimum: 1,
    },
    role_id: {
      title: "ContractorRole.role_id",
      type: "string",
    },
    manage_roles: {
      title: "ContractorRole.manage_roles",
      type: "boolean",
    },
    manage_orders: {
      title: "ContractorRole.manage_orders",
      type: "boolean",
    },
    kick_members: {
      title: "ContractorRole.kick_members",
      type: "boolean",
    },
    manage_invites: {
      title: "ContractorRole.manage_invites",
      type: "boolean",
    },
    manage_org_details: {
      title: "ContractorRole.manage_org_details",
      type: "boolean",
    },
    manage_stock: {
      title: "ContractorRole.manage_stock",
      type: "boolean",
    },
    manage_market: {
      title: "ContractorRole.manage_market",
      type: "boolean",
    },
    manage_recruiting: {
      title: "ContractorRole.manage_recruiting",
      type: "boolean",
    },
    manage_webhooks: {
      title: "ContractorRole.manage_webhooks",
      type: "boolean",
    },
  },
  required: [
    "contractor_id",
    "name",
    "position",
    "role_id",
    "manage_roles",
    "manage_orders",
    "kick_members",
    "manage_invites",
    "manage_org_details",
    "manage_stock",
    "manage_market",
    "manage_recruiting",
    "manage_webhooks",
  ],
  additionalProperties: false,
  title: "ContractorRole",
  type: "object",
})

oapi.schema("OrderWebhook", {
  properties: {
    name: {
      title: "OrderWebhook.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    webhook_url: {
      title: "OrderWebhook.webhook_url",
      type: "string",
      minLength: 3,
      maxLength: 1000,
    },
    actions: {
      title: "OrderWebhook.actions",
      type: "array",
      minItems: 0,
      items: {
        type: "string",
      },
      maxLength: 30,
    },
  },
  required: ["name", "webhook_url", "actions"],
  additionalProperties: false,
  title: "ContractorRoleBody",
  type: "object",
})

oapi.schema("ContractorRoleBody", {
  properties: {
    name: {
      title: "ContractorRoleBody.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    manage_roles: {
      title: "ContractorRoleBody.manage_roles",
      type: "boolean",
    },
    manage_orders: {
      title: "ContractorRoleBody.manage_orders",
      type: "boolean",
    },
    kick_members: {
      title: "ContractorRoleBody.kick_members",
      type: "boolean",
    },
    manage_invites: {
      title: "ContractorRoleBody.manage_invites",
      type: "boolean",
    },
    manage_org_details: {
      title: "ContractorRoleBody.manage_org_details",
      type: "boolean",
    },
    manage_stock: {
      title: "ContractorRoleBody.manage_stock",
      type: "boolean",
    },
    manage_market: {
      title: "ContractorRoleBody.manage_market",
      type: "boolean",
    },
    manage_recruiting: {
      title: "ContractorRoleBody.manage_recruiting",
      type: "boolean",
    },
    manage_webhooks: {
      title: "ContractorRoleBody.manage_webhooks",
      type: "boolean",
    },
  },
  required: [
    "name",
    "manage_roles",
    "manage_orders",
    "kick_members",
    "manage_invites",
    "manage_org_details",
    "manage_stock",
    "manage_market",
    "manage_recruiting",
    "manage_webhooks",
  ],
  additionalProperties: false,
  title: "ContractorRoleBody",
  type: "object",
})

oapi.schema("ContractorRoleUpdateBody", {
  properties: {
    name: {
      title: "ContractorRoleUpdateBody.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    position: {
      title: "ContractorRoleUpdateBody.position",
      type: "integer",
      minimum: 1,
    },
    manage_roles: {
      title: "ContractorRoleUpdateBody.manage_roles",
      type: "boolean",
    },
    manage_orders: {
      title: "ContractorRoleUpdateBody.manage_orders",
      type: "boolean",
    },
    kick_members: {
      title: "ContractorRoleUpdateBody.kick_members",
      type: "boolean",
    },
    manage_invites: {
      title: "ContractorRoleUpdateBody.manage_invites",
      type: "boolean",
    },
    manage_org_details: {
      title: "ContractorRoleUpdateBody.manage_org_details",
      type: "boolean",
    },
    manage_stock: {
      title: "ContractorRoleUpdateBody.manage_stock",
      type: "boolean",
    },
    manage_market: {
      title: "ContractorRoleUpdateBody.manage_market",
      type: "boolean",
    },
    manage_recruiting: {
      title: "ContractorRoleUpdateBody.manage_recruiting",
      type: "boolean",
    },
    manage_webhooks: {
      title: "ContractorRoleUpdateBody.manage_webhooks",
      type: "boolean",
    },
  },
  required: [
    "name",
    "position",
    "manage_roles",
    "manage_orders",
    "kick_members",
    "manage_invites",
    "manage_org_details",
    "manage_stock",
    "manage_market",
    "manage_recruiting",
    "manage_webhooks",
  ],
  additionalProperties: false,
  title: "ContractorRoleUpdateBody",
  type: "object",
})

oapi.schema("Contractor", {
  properties: {
    kind: {
      enum: ["independent", "organization"],
      title: "Contractor.kind",
      type: "string",
    },
    avatar: {
      title: "Contractor.avatar",
      type: "string",
    },
    banner: {
      title: "Contractor.banner",
      type: "string",
    },
    site_url: {
      title: "Contractor.site_url",
      type: "string",
    },
    rating: {
      $ref: "#/components/schemas/Rating",
      title: "Contractor.rating",
    },
    size: {
      title: "Contractor.size",
      type: "integer",
      minimum: 0,
    },
    name: {
      title: "Contractor.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    description: {
      title: "Contractor.description",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    fields: {
      items: {
        $ref: "#/components/schemas/ContractorKindIconKey",
        title: "Contractor.fields.[]",
      },
      title: "Contractor.fields",
      type: "array",
    },
    spectrum_id: {
      title: "Contractor.spectrum_id",
      type: "string",
    },
    market_order_template: {
      title: "Contractor.market_order_template",
      type: "string",
    },
    members: {
      items: {
        properties: {
          username: {
            title: "Contractor.members.[].username",
            type: "string",
          },
          roles: {
            items: {
              title: "Contractor.members.[].roles.[]",
              type: "string",
            },
            title: "Contractor.members.[].roles",
            type: "array",
          },
        },
        required: ["username", "roles"],
        additionalProperties: false,
        title: "Contractor.members.[]",
        type: "object",
      },
      title: "Contractor.members",
      type: "array",
    },
    roles: {
      items: {
        $ref: "#/components/schemas/ContractorRole",
        title: "Contractor.roles.[]",
      },
      title: "Contractor.roles",
      type: "array",
    },
    default_role: {
      title: "Contractor.default_role",
      type: "string",
    },
    owner_role: {
      title: "Contractor.owner_role",
      type: "string",
    },
    balance: {
      title: "Contractor.balance",
      type: "number",
    },
  },
  required: [
    "kind",
    "avatar",
    "banner",
    "rating",
    "size",
    "name",
    "description",
    "fields",
    "spectrum_id",
    "members",
  ],
  additionalProperties: false,
  title: "Contractor",
  type: "object",
})

oapi.schema("ContractorBody", {
  properties: {
    logo: {
      title: "ContractorBody.logo",
      type: "string",
    },
    banner: {
      title: "ContractorBody.banner",
      type: "string",
    },
    name: {
      title: "ContractorBody.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    description: {
      title: "ContractorBody.description",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    identifier: {
      title: "ContractorBody.identifier",
      type: "string",
      minLength: 3,
      maxLength: 30,
    },
  },
  required: ["logo", "banner", "name", "description", "identifier"],
  additionalProperties: false,
  title: "ContractorBody",
  type: "object",
})

oapi.schema("ContractorUpdateBody", {
  properties: {
    avatar_url: {
      title: "ContractorUpdateBody.avatar_url",
      type: "string",
    },
    banner_url: {
      title: "ContractorUpdateBody.banner_url",
      type: "string",
    },
    site_url: {
      title: "ContractorUpdateBody.site_url",
      type: "string",
    },
    name: {
      title: "ContractorUpdateBody.name",
      type: "string",
      minLength: 3,
      maxLength: 100,
    },
    description: {
      title: "ContractorUpdateBody.description",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    market_order_template: {
      title: "ContractorUpdateBody.market_order_template",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    tags: {
      title: "ContractorUpdateBody.tags",
      type: "array",
      items: {
        type: "string",
        enum: VALID_ORG_TAGS,
      },
    },
  },
  required: [],
  additionalProperties: false,
  title: "ContractorBody",
  type: "object",
})

oapi.schema("ContractorMemberSearchBody", {
  properties: {
    spectrum_id: {
      title: "ContractorMemberSearchBody.spectrum_id",
      type: "string",
      maxLength: 50,
      minLength: 3,
    },
    query: {
      title: "ContractorMemberSearchBody.query",
      type: "string",
      minLength: 3,
      maxLength: 50,
    },
  },
  required: ["spectrum_id", "query"],
  additionalProperties: false,
  title: "ContractorMemberSearchBody",
  type: "object",
})

contractorsRouter.post(
  "/auth/link",
  oapi.validPath({
    summary: "Verify a contractor with the site",
    deprecated: false,
    description: "",
    operationId: "authLink",
    tags: ["Contractors"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              content: {
                title: "contractor",
                type: "string",
                maxLength: 50,
                minLength: 3,
              },
            },
            required: ["contractor"],
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "OrgRegistered",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  verifiedUser,
  async (req, res, next) => {
    const user = req.user as User

    const spectrum_id = req.body.contractor || ""

    try {
      const cobj = await database.getContractor({ spectrum_id: spectrum_id })
      if (cobj) {
        res.status(409).json(
          createErrorResponse({
            message: "Org is already registered!",
            status: "error",
          }),
        )
        return
      }
    } catch {}

    if (await authorizeContractor(spectrum_id, user.user_id)) {
      const contractor = await database.getContractor({ spectrum_id })
      res.json(createResponse(contractorDetails(contractor, user)))
    } else {
      res.status(403).json(
        createErrorResponse({
          message: "Failed to authenticate",
          status: "error",
        }),
      )
    }
  },
)

contractorsRouter.post(
  "/",
  oapi.validPath({
    summary: "Create a new contractor",
    deprecated: false,
    description: "",
    operationId: "createContractor",
    tags: ["Contractors"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("ContractorBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  title: "data",
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "CreateANewOrderCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User

    const { description, name, identifier, logo, banner } = req.body as {
      description: string
      name: string
      identifier: string
      logo: string
      banner: string
    }

    try {
      const cobj = await database.getContractor({
        spectrum_id: `~${identifier.toUpperCase()}`,
      })
      if (cobj) {
        res.status(409).json(
          createErrorResponse({
            message: "Org is already registered!",
            status: "error",
          }),
        )
        return
      }
    } catch {}

    await createContractor({
      description: description.trim(),
      name,
      spectrum_id: `~${identifier.toUpperCase()}`,
      owner_id: user.user_id,
      logo,
      banner,
      member_count: 1,
    })
    res.status(201).json(createResponse({ result: "Success" }))
    return
  },
)

contractorsRouter.get(
  "/search/:query",
  oapi.validPath({
    summary: "Search contractors",
    deprecated: false,
    description: "",
    operationId: "searchContractors",
    tags: ["Contractors"],
    parameters: [
      {
        name: "query",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("MinimalContractor"),
                },
              },
              required: ["data"],
              type: "object",
              title: "SearchContractorsOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  rate_limit(2),
  userAuthorized,
  async (req, res, next) => {
    const query = req.params["query"]

    const contractors = await database.searchContractors(query)

    res.json(
      createResponse(
        await Promise.all(
          contractors.map(async (contractor) => {
            return {
              spectrum_id: contractor.spectrum_id,
              name: contractor.name,
              avatar: await cdn.getFileLinkResource(contractor.avatar),
            }
          }),
        ),
      ),
    )
  },
)

contractorsRouter.get(
  "/invites/:invite_id",
  oapi.validPath({
    summary: "Fetch details about a contractor invite",
    deprecated: false,
    description: "",
    operationId: "getInviteCode",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "invite_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {
                    spectrum_id: {
                      nullable: false,
                      type: "string",
                      minLength: 3,
                    },
                  },
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const { invite_id } = req.params

    // Invite Code
    const [invite] = await database.getInviteCodes({
      invite_id,
    })

    if (!invite) {
      res.status(404).json(createErrorResponse({ message: "Invalid invite" }))
      return
    }

    const contractor: DBContractor = await database.getContractor({
      contractor_id: invite.contractor_id,
    })

    res.json(createResponse({ spectrum_id: contractor.spectrum_id }))
  },
)

contractorsRouter.post(
  "/invites/:invite_id/accept",
  oapi.validPath({
    summary: "Accept a contractor invite code",
    deprecated: false,
    description: "",
    operationId: "acceptCodeInvite",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "invite_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User

    const { invite_id } = req.params

    // Invite Code
    const [invite] = await database.getInviteCodes({
      invite_id,
    })

    if (!invite) {
      res.status(404).json(createErrorResponse({ message: "Invalid invite" }))
      return
    }

    const contractor: DBContractor = await database.getContractor({
      contractor_id: invite.contractor_id,
    })

    const role = await database.getContractorRoleLegacy(
      user.user_id,
      contractor.contractor_id,
    )

    if (role) {
      res.status(409).json(createErrorResponse({ message: "Already member" }))
      return
    }

    await database.updateInviteCodes(
      {
        invite_id,
        contractor_id: contractor.contractor_id,
      },
      { times_used: invite.times_used + 1 },
    )

    await database.removeContractorInvites(
      user.user_id,
      contractor.contractor_id,
    )

    await database.insertContractorMember(
      contractor.contractor_id,
      user.user_id,
      "member",
    )

    await database.insertContractorMemberRole({
      user_id: user.user_id,
      role_id: contractor.default_role,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.get(
  "/:spectrum_id/members/search/:query",
  oapi.validPath({
    summary: "Search contractor members",
    deprecated: false,
    description: "",
    operationId: "searchContractorMembers",
    tags: ["Contractors"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "query",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("MinimalUser"),
                },
              },
              required: ["data"],
              type: "object",
              title: "SearchContractorMembersOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  rate_limit(2),
  userAuthorized,
  valid_contractor,
  async (req, res, next) => {
    const query = req.params["query"]

    const users = await database.searchOrgMembers(
      query,
      req.contractor!.contractor_id,
    )

    res.json(
      createResponse(
        await Promise.all(
          users.map(async (user) => {
            const pubProf = await database.getMinimalUser({
              user_id: user.user_id,
            })

            return { ...pubProf, role: user.role }
          }),
        ),
      ),
    )
  },
)

contractorsRouter.get(
  "/:spectrum_id/members/csv",
  oapi.validPath({
    summary: "Create a new contractor",
    deprecated: false,
    description: "",
    operationId: "createContractor",
    tags: ["Contractors"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/csv": {},
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  rate_limit(2),
  userAuthorized,
  valid_contractor,
  async (req, res, next) => {
    const members = await database.getContractorMembersUsernamesAndID({
      "contractor_members.contractor_id": req.contractor!.contractor_id,
    })

    res
      .setHeader("Content-Type", "application/csv")
      .set(
        "Content-Disposition",
        `attachment; filename="${req.contractor!.spectrum_id}_members.csv"`,
      )
      .json(members.map((m) => m.username).join("\n"))
  },
)

contractorsRouter.get(
  "/:spectrum_id/customers",
  oapi.validPath({
    summary: "Get Contractor Customers",
    deprecated: false,
    description: "",
    operationId: "getContractorCustomers",
    tags: ["Contractors"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("MinimalUser"), // TODO: Make it full user type
                },
              },
              required: ["data"],
              type: "object",
              title: "SearchContractorMembersOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  userAuthorized,
  valid_contractor,
  async (req, res) => {
    const user = req.user as User
    const contractor: Contractor = req.contractor!

    const contractors = await database.getUserContractors({
      "contractor_members.user_id": user.user_id,
    })

    const unrelated =
      contractors.filter((c) => c.contractor_id === contractor!.contractor_id)
        .length === 0
    if (unrelated) {
      res.status(403).json(
        createErrorResponse({
          message: "You are not authorized to view this data",
        }),
      )
      return
    }

    const customers = await database.getContractorCustomers(
      contractor.contractor_id,
    )
    res.json(
      await Promise.all(
        customers.map(async (customer) => {
          const prof = await database.getMinimalUser({
            user_id: customer.user_id,
          })
          return {
            ...prof,
            spent: customer.spent,
          }
        }),
      ),
    )
  },
)

contractorsRouter.get(
  "/:spectrum_id/reviews",
  valid_contractor,
  oapi.validPath({
    summary: "Get contractor reviews",
    deprecated: false,
    description: "",
    operationId: "getContractorReviews",
    tags: ["Order Reviews"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      content: {
                        title: "content",
                        type: "string",
                        maxLength: 1000,
                      },
                      rating: {
                        title: "rating",
                        type: "number",
                        minimum: 0,
                        multipleOf: 0.5,
                      },
                      role: {
                        title: "role",
                        type: "string",
                        enum: ["contractor", "customer"],
                      },
                      contractor_author: {
                        title: "contractor_author",
                        ...oapi.schema("MinimalContractor"),
                        nullable: true,
                      },
                      user_author: {
                        title: "user_author",
                        ...oapi.schema("MinimalUser"),
                        nullable: true,
                      },
                    },
                    required: ["content", "rating", "role"],
                  },
                },
              },
              required: ["data"],
              type: "object",
              title: "SearchContractorMembersOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  async (req, res, next) => {
    const contractor: Contractor = req.contractor!

    const reviews = await database.getContractorReviews(
      contractor.contractor_id,
    )
    res.json(
      createResponse(
        await Promise.all(
          reviews.map(async (review) => {
            return {
              ...review,
              user_author: review.user_author
                ? await database.getMinimalUser({ user_id: review.user_author })
                : null,
              contractor_author: review.contractor_author
                ? await database.getMinimalContractor({
                    contractor_id: review.contractor_author,
                  })
                : null,
            }
          }),
        ),
      ),
    )
  },
)

contractorsRouter.get(
  "/:spectrum_id",
  oapi.validPath({
    summary: "Get a contractor",
    deprecated: false,
    description: "",
    operationId: "getContractor",
    tags: ["Contractors"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  ...oapi.schema("Contractor"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  valid_contractor,
  async (req, res, next) => {
    const user = req.user as User

    res.json(createResponse(await contractorDetails(req.contractor!, user)))
  },
)

contractorsRouter.post(
  "/:spectrum_id/roles",
  oapi.validPath({
    summary: "Create a contractor role",
    deprecated: false,
    description: "",
    operationId: "createContractorRole",
    tags: ["Contractor Roles"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            ...oapi.schema("ContractorRoleBody"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_roles"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const {
      manage_roles,
      manage_orders,
      kick_members,
      manage_invites,
      manage_org_details,
      manage_stock,
      manage_market,
      manage_webhooks,
      manage_recruiting,
      name,
    }: {
      manage_roles: boolean
      manage_orders: boolean
      kick_members: boolean
      manage_invites: boolean
      manage_org_details: boolean
      manage_stock: boolean
      manage_market: boolean
      manage_webhooks: boolean
      manage_recruiting: boolean
      name: string
    } = req.body

    const roles = await database.getContractorRoles({
      contractor_id: contractor.contractor_id,
    })

    await database.insertContractorRole({
      contractor_id: contractor.contractor_id,
      manage_roles: manage_roles,
      manage_orders: manage_orders,
      kick_members: kick_members,
      manage_invites: manage_invites,
      manage_org_details: manage_org_details,
      manage_stock: manage_stock,
      manage_market: manage_market,
      manage_webhooks: manage_webhooks,
      manage_recruiting: manage_recruiting,
      position: Math.max(...roles.map((r) => r.position)) + 1,
      name: name,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.put(
  "/:spectrum_id/roles/:role_id",
  oapi.validPath({
    summary: "Update a contractor role",
    deprecated: false,
    description: "",
    operationId: "updateContractorRole",
    tags: ["Contractor Roles"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "role_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            ...oapi.schema("ContractorRoleUpdateBody"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_roles"),
  async (req, res, next) => {
    const role_id = req.params["role_id"]
    const user = req.user as User
    const contractor = req.contractor!

    const {
      manage_roles,
      manage_orders,
      kick_members,
      manage_invites,
      manage_org_details,
      manage_stock,
      manage_market,
      manage_webhooks,
      manage_recruiting,
      name,
      position,
    }: {
      manage_roles: boolean
      manage_orders: boolean
      kick_members: boolean
      manage_invites: boolean
      manage_org_details: boolean
      manage_stock: boolean
      manage_market: boolean
      manage_webhooks: boolean
      manage_recruiting: boolean
      name: string
      position: number
    } = req.body

    const role = await database.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })

    if (!role) {
      res.status(404).json(createErrorResponse({ message: "Invalid role." }))
      return
    }

    if (
      !(await can_manage_role(contractor.contractor_id, role_id, user.user_id))
    ) {
      res.status(403).json(createErrorResponse({ message: "No permissions." }))
      return
    }
    if (
      (await get_min_position(contractor.contractor_id, user.user_id)) >=
      position
    ) {
      return
    }

    await database.updateContractorRole(
      { contractor_id: contractor.contractor_id, role_id },
      {
        contractor_id: contractor.contractor_id,
        manage_roles: manage_roles,
        manage_orders: manage_orders,
        kick_members: kick_members,
        manage_invites: manage_invites,
        manage_org_details: manage_org_details,
        manage_stock: manage_stock,
        manage_market: manage_market,
        manage_webhooks: manage_webhooks,
        manage_recruiting: manage_recruiting,
        name: name,
        position: position,
      },
    )

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.delete(
  "/:spectrum_id/roles/:role_id",
  oapi.validPath({
    summary: "Delete a contractor role",
    deprecated: false,
    description: "",
    operationId: "deleteContractorRole",
    tags: ["Contractor Roles"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "role_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "204": {
        description: "Deleted - Resource successfully deleted",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_roles"),
  async (req, res, next) => {
    const role_id = req.params["role_id"]
    const user = req.user as User
    const contractor = req.contractor!

    const role = await database.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })

    if (!role) {
      res.status(400).json(createErrorResponse({ message: "Invalid role." }))
      return
    }

    if (
      !(await can_manage_role(contractor.contractor_id, role_id, user.user_id))
    ) {
      res.status(400).json(createErrorResponse({ message: "No permissions." }))
      return
    }

    if (role_id === contractor.default_role) {
      res
        .status(403)
        .json(createErrorResponse({ message: "This role cannot be removed." }))
      return
    }

    await database.deleteContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })

    res.status(204).json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.post(
  "/:spectrum_id/roles/:role_id/members/:username",
  oapi.validPath({
    summary: "Give a user a contractor role",
    deprecated: false,
    description: "",
    operationId: "giveContractorRole",
    tags: ["Contractor Roles"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "role_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "username",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_roles"),
  async (req, res, next) => {
    const user = req.user as User
    const contractor = req.contractor!

    const { username, role_id } = req.params

    // Do checks first
    let target
    try {
      target = await database.getUser({ username })
    } catch (e) {
      res.status(404).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await database.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })
    const target_is_member = await is_member(
      contractor.contractor_id,
      target.user_id,
    )
    if (!target_is_member) {
      res.status(404).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    if (!role) {
      res.status(404).json(createErrorResponse({ message: "Invalid role" }))
      return
    }

    const outranked = await outranks(
      contractor.contractor_id,
      target.user_id,
      user.user_id,
    )

    if (outranked) {
      // You are outranked or equal
      res.status(403).json(createErrorResponse({ message: "No permissions" }))
      return
    }

    await database.insertContractorMemberRole({
      user_id: target.user_id,
      role_id,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.delete(
  "/:spectrum_id/roles/:role_id/members/:username",
  oapi.validPath({
    summary: "Remove a contractor role from a user",
    deprecated: false,
    description: "",
    operationId: "removeContractorRole",
    tags: ["Contractor Roles"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "role_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "username",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "204": {
        description: "Deleted - Resource successfully deleted",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_roles"),
  async (req, res, next) => {
    const user = req.user as User
    const contractor = req.contractor!
    const { username, role_id } = req.params

    // Do checks first
    let target
    try {
      target = await database.getUser({ username })
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await database.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })
    const target_is_member = await is_member(
      contractor.contractor_id,
      target.user_id,
    )
    if (!target_is_member) {
      res.status(400).json(createErrorResponse({ message: "Invalid user." }))
      return
    }

    if (!role) {
      res.status(400).json(createErrorResponse({ message: "Invalid role." }))
      return
    }

    const outranked = await outranks(
      contractor.contractor_id,
      target.user_id,
      user.user_id,
    )

    if (outranked) {
      // You are outranked or equal
      res.status(403).json(createErrorResponse({ message: "No permissions." }))
      return
    }

    if (role_id === contractor.default_role) {
      res
        .status(403)
        .json(createErrorResponse({ message: "This role cannot be removed." }))
      return
    }

    await database.removeContractorMemberRoles({
      user_id: target.user_id,
      role_id,
    })

    res.json(createErrorResponse({ result: "Success" }))
  },
)

contractorsRouter.delete(
  "/:spectrum_id/members/:username",
  oapi.validPath({
    summary: "Kick a contractor member",
    deprecated: false,
    description: "",
    operationId: "kickContractorMember",
    tags: ["Contractor Members"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "username",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "204": {
        description: "Deleted - Resource successfully deleted",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("kick_members"),
  async (req, res, next) => {
    try {
      const user = req.user as User
      const contractor = req.contractor!

      const { username } = req.params

      // Do checks first
      let target
      try {
        target = await database.getUser({ username })
      } catch (e) {
        res.status(400).json(createErrorResponse({ message: "Invalid user" }))
        return
      }

      const target_is_member = await is_member(
        contractor.contractor_id,
        target.user_id,
      )
      if (!target_is_member) {
        res.status(400).json(createErrorResponse({ message: "Invalid user" }))
        return
      }

      const outranked = await outranks(
        contractor.contractor_id,
        target.user_id,
        user.user_id,
      )

      if (outranked) {
        // You are outranked or equal
        res.status(403).json(createErrorResponse({ message: "No permissions" }))
        return
      }

      await database.removeContractorMember({
        user_id: target.user_id,
        contractor_id: contractor.contractor_id,
      })
      await database.removeUserContractorRoles(
        contractor.contractor_id,
        target.user_id,
      )

      res.json(createResponse({ result: "Success" }))
    } catch (e) {
      console.error(e)
      res
        .status(500)
        .json(createErrorResponse({ message: "Internal server error" }))
      return
    }
  },
)

contractorsRouter.put(
  "/:spectrum_id",
  oapi.validPath({
    summary: "Update a contractor",
    deprecated: false,
    description: "",
    operationId: "updateContractor",
    tags: ["Contractors"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            ...oapi.schema("ContractorUpdateBody"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Updated - Resource successfully updated",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_org_details"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const {
      description,
      tags,
      avatar_url,
      site_url,
      name,
      banner_url,
      market_order_template,
    }: {
      description?: string
      tags?: string[]
      avatar_url?: string
      site_url?: string
      name?: string
      banner_url?: string
      market_order_template?: string
    } = req.body

    // Do checks first
    if (avatar_url && !avatar_url.match(external_resource_regex)) {
      res.status(400).json(createErrorResponse({ message: "Invalid URL" }))
      return
    }

    if (banner_url && !banner_url.match(external_resource_regex)) {
      res.status(400).json(createErrorResponse({ message: "Invalid URL" }))
      return
    }

    const old_avatar = contractor.avatar
    const old_banner = contractor.banner

    // Then insert
    let avatar_resource = undefined
    if (avatar_url) {
      avatar_resource = await cdn.createExternalResource(
        avatar_url,
        contractor.contractor_id + "_org_avatar",
      )
    }

    let banner_resource = undefined
    if (banner_url) {
      banner_resource = await cdn.createExternalResource(
        banner_url,
        contractor.contractor_id + "_org_banner",
      )
    }

    if (
      description !== undefined ||
      avatar_resource !== undefined ||
      banner_resource !== undefined ||
      name !== undefined ||
      market_order_template !== undefined
    ) {
      await database.updateContractor(
        { contractor_id: contractor.contractor_id },
        {
          description:
            description !== undefined ? description || "" : undefined,
          avatar: avatar_resource ? avatar_resource.resource_id : undefined,
          banner: banner_resource ? banner_resource.resource_id : undefined,
          name: name || undefined,
          market_order_template: market_order_template,
        },
      )
    }

    if (tags && tags.length) {
      await database.setContractorFields(contractor.contractor_id, tags)
    }

    if (avatar_url) {
      await cdn.removeResource(old_avatar)
    }

    if (banner_url) {
      await cdn.removeResource(old_banner)
    }

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.post(
  "/:spectrum_id/webhooks",
  oapi.validPath({
    summary: "Create a webhook for a contractor",
    deprecated: false,
    description: "",
    operationId: "createContractorWebhook",
    tags: ["Contractor Webhooks"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            ...oapi.schema("OrderWebhook"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_webhooks"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const {
      webhook_url,
      name,
      actions,
    }: {
      webhook_url: string
      name: string
      actions: string[]
    } = req.body

    // Do checks first
    if (!webhook_url || !name) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid arguments" }))
      return
    }

    try {
      await createNotificationWebhook(
        name,
        webhook_url,
        actions,
        contractor.contractor_id,
        undefined,
      )
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid actions" }))
      return
    }

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.delete(
  "/:spectrum_id/webhooks/:webhook_id",
  oapi.validPath({
    summary: "Create a webhook for a contractor",
    deprecated: false,
    description: "",
    operationId: "createContractorWebhook",
    tags: ["Contractor Webhooks"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "webhook_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "204": {
        description: "Deleted - Resource successfully deleted",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_webhooks"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const { webhook_id } = req.params

    const webhook = await database.getNotificationWebhook({ webhook_id })
    if (webhook?.contractor_id !== contractor.contractor_id) {
      res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
      return
    }

    await database.deleteNotificationWebhook({
      webhook_id,
      contractor_id: contractor.contractor_id,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.get(
  "/:spectrum_id/webhooks",
  oapi.validPath({
    summary: "Get contractor webhooks",
    deprecated: false,
    description: "",
    operationId: "getContractorWebhooks",
    tags: ["Contractor Webhooks"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("OrderWebhook"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  org_permission("manage_webhooks"),
  userAuthorized,
  async (req, res, next) => {
    const contractor = req.contractor!

    const webhooks = await database.getNotificationWebhooks({
      contractor_id: contractor.contractor_id,
    })
    res.json(createResponse(webhooks))
  },
)

contractorsRouter.post(
  "/:spectrum_id/invites",
  oapi.validPath({
    summary: "Create contractor invite",
    deprecated: false,
    description: "",
    operationId: "createContractorInvite",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              max_uses: {
                title: "max_uses",
                type: "integer",
                minimum: 0,
              },
            },
            required: [],
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  ...oapi.schema("ContractorInviteCode"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_invites"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const {
      max_uses,
    }: {
      max_uses: number
    } = req.body

    // Do checks first
    if (!Number.isSafeInteger(max_uses)) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid arguments" }))
      return
    }

    await database.createInviteCode({
      max_uses,
      contractor_id: contractor.contractor_id,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.delete(
  "/:spectrum_id/invites/:invite_id",
  oapi.validPath({
    summary: "Get a contractor invite by ID",
    deprecated: false,
    description: "",
    operationId: "getContractorInviteByID",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "invite_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("ContractorInviteCode"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_invites"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const { invite_id } = req.params

    // Do checks first
    if (!invite_id) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid arguments" }))
      return
    }

    const inviteCode = await database.getInviteCode({ invite_id })
    if (inviteCode?.contractor_id !== contractor.contractor_id) {
      res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
      return
    }

    await database.deleteInviteCodes({
      invite_id,
      contractor_id: contractor.contractor_id,
    })
    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.get(
  "/:spectrum_id/invites",
  oapi.validPath({
    summary: "Get contractor invites",
    deprecated: false,
    description: "",
    operationId: "getContractorInvites",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("ContractorInviteCode"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_invites"),
  async (req, res, next) => {
    const contractor = req.contractor!

    const invites = await database.getInviteCodes({
      contractor_id: contractor.contractor_id,
    })
    res.json(createResponse(invites))
  },
)

contractorsRouter.post(
  "/:spectrum_id/members",
  oapi.validPath({
    summary: "Invite members to contractor",
    deprecated: false,
    description: "",
    operationId: "contractorInviteMembers",
    tags: ["Contractor Members"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            properties: {
              message: {
                type: "string",
                maxLength: 1000,
              },
              usernames: {
                type: "array",
                items: {
                  type: "string",
                },
                minItems: 1,
                maxItems: 50,
              },
            },
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  ...oapi.schema("ContractorInviteCode"),
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_invites"),
  async (req, res) => {
    const contractor = req.contractor!

    const {
      usernames,
      message,
    }: {
      usernames: string[]
      message: string
    } = req.body

    // Do checks first
    const users = []
    for (const username of usernames) {
      try {
        users.push(await database.getUser({ username }))
      } catch {
        res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
        return
      }
    }

    for (const target of users) {
      const role = await database.getContractorRoleLegacy(
        target.user_id,
        contractor.contractor_id,
      )
      if (role) {
        res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
        return
      }
    }

    const invites = await database.insertContractorInvites(
      users.map((u) => ({
        user_id: u.user_id,
        message: message,
        contractor_id: contractor.contractor_id,
      })),
    )

    await createContractorInviteNotification(invites[0])

    res.json(createResponse({ result: "Success" }))
  },
)

contractorsRouter.post(
  "/:spectrum_id/refetch",
  adminAuthorized,
  async (req, res) => {
    try {
      const spectrum_id = req.params["spectrum_id"]

      let contractor, data
      try {
        contractor = await database.getContractor({ spectrum_id })
        data = await fetchRSIOrgSCAPI(spectrum_id)
      } catch (e) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }

      const banner_resource = await database.getImageResource({
        resource_id: contractor.banner,
      })
      if (banner_resource.filename === "default_profile_banner.png") {
        const old_banner = contractor.banner

        let banner_resource = undefined
        if (data.data.banner) {
          banner_resource = await cdn.createExternalResource(
            data.data.banner,
            contractor.contractor_id + "_org_banner",
          )

          await database.updateContractor(
            { contractor_id: contractor.contractor_id },
            {
              banner: banner_resource ? banner_resource.resource_id : undefined,
            },
          )

          await cdn.removeResource(old_banner)
        }
      }

      await database.updateContractor(
        { contractor_id: contractor.contractor_id },
        { size: data.data.members },
      )

      res.json(createResponse({ result: "Success" }))
    } catch (e) {
      console.error(e)
    }
  },
)

contractorsRouter.post(
  "/:spectrum_id/accept",
  oapi.validPath({
    summary: "Accept a contractor invite",
    deprecated: false,
    description: "",
    operationId: "acceptContractorInvite",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  valid_contractor,
  async (req, res, next) => {
    try {
      const user = req.user as User

      const { invite_id }: { invite_id?: string } = req.body

      const contractor = req.contractor!

      if (invite_id) {
        // Invite Code
        const invites = await database.getInviteCodes({
          invite_id,
          contractor_id: contractor.contractor_id,
        })

        if (!invites.length) {
          res
            .status(400)
            .json(createErrorResponse({ message: "Invalid invite" }))
          return
        }

        const role = await database.getContractorRoleLegacy(
          user.user_id,
          contractor.contractor_id,
        )
        if (role) {
          res
            .status(400)
            .json(createErrorResponse({ message: "Already member" }))
          return
        }

        const codes = await database.updateInviteCodes(
          {
            invite_id,
            contractor_id: contractor.contractor_id,
          },
          { times_used: invites[0].times_used + 1 },
        )

        if (codes[0].times_used >= codes[0].max_uses) {
          await database.deleteInviteCodes({
            invite_id,
            contractor_id: contractor.contractor_id,
          })
        }
      } else {
        // Direct Invite
        const invites = await database.getContractorInvites({
          user_id: user.user_id,
          contractor_id: contractor.contractor_id,
        })

        if (!invites.length) {
          res
            .status(400)
            .json(createErrorResponse({ message: "Invalid contractor" }))
          return
        }
      }

      await database.removeContractorInvites(
        user.user_id,
        contractor.contractor_id,
      )

      await database.insertContractorMember(
        contractor.contractor_id,
        user.user_id,
        "member",
      )

      await database.insertContractorMemberRole({
        user_id: user.user_id,
        role_id: contractor.default_role,
      })

      res.json(createResponse({ result: "Success" }))
    } catch (e) {
      console.error(e)
      res
        .status(500)
        .json(createErrorResponse({ message: "Internal server error" }))
      return
    }
  },
)

contractorsRouter.post(
  "/:spectrum_id/decline",
  oapi.validPath({
    summary: "Decline a contractor invite",
    deprecated: false,
    description: "",
    operationId: "declineContractorInvite",
    tags: ["Contractor Invites"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  valid_contractor,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const user = req.user as User

    const contractor = req.contractor!

    const invites = await database.getContractorInvites({
      user_id: user.user_id,
      contractor_id: contractor.contractor_id,
    })

    if (!invites.length) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }

    await database.removeContractorInvites(
      user.user_id,
      contractor.contractor_id,
    )

    res.json({ result: "Success" })
  },
)

contractorsRouter.post(
  "/admin/express_verify",
  adminAuthorized,
  async (req, res, next) => {
    try {
      const { owner_username, owner_discord_id, spectrum_id } = req.body as {
        spectrum_id: string
        owner_username: string
        owner_discord_id: string
      }

      let user
      try {
        user = await database.getUser({ username: owner_username })
      } catch (e) {
        user = await database.insertUserRaw({
          discord_id: owner_discord_id,
          username: `user_${owner_discord_id}`,
          display_name: `user_${owner_discord_id}`,
        })
        await authorizeProfile(owner_username, user.user_id, true)
      }

      await authorizeContractor(spectrum_id, user.user_id, true)

      res.json(createResponse({ result: "Success" }))
    } catch (e) {
      console.error(e)
      res
        .status(500)
        .json(createErrorResponse({ message: "Internal server error" }))
      return
    }
  },
)

contractorsRouter.get("", async (req, res, next) => {
  try {
    const query = req.query as {
      index?: string
      reverseSort: string
      sorting: string
      query: string
      fields: string
      rating: string
      pageSize: string
    }

    const searchData = convertQuery(query)

    let contractor: DBContractor[] = []
    try {
      contractor = await database.getAllContractorsPaginated(searchData)
    } catch (e) {
      console.error(e)
    }
    const user = req.user as User
    const counts = await database.getAllContractorsCount(searchData)
    const formatted = await Promise.all(
      contractor.map((c) => contractorDetails(c, user)),
    )

    res.json(createResponse({ total: counts[0].count, items: formatted }))
  } catch (e) {
    console.error(e)
  }
})

contractorsRouter.get(
  "/:spectrum_id/settings/discord",
  userAuthorized,
  org_permission("manage_webhooks"),
  async (req, res, next) => {
    const user = req.user as User
    const spectrum_id = req.params["spectrum_id"]

    const contractor = req.contractor!

    let guild
    let avatar
    if (contractor.official_server_id) {
      guild = await fetchGuild(contractor.official_server_id)
      avatar = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=240`
    }

    let channel
    if (contractor.discord_thread_channel_id) {
      channel = await fetchChannel(contractor.discord_thread_channel_id)
    }

    res.json(
      createResponse({
        guild_avatar: avatar,
        guild_name: guild?.name,
        channel_name: channel?.name,
        official_server_id: contractor.official_server_id,
        discord_thread_channel_id: contractor.discord_thread_channel_id,
      }),
    )
  },
)

contractorsRouter.post(
  "/:spectrum_id/settings/discord/use_official",
  oapi.validPath({
    summary: "Use the official server for Discord webhooks",
    deprecated: false,
    description: "",
    operationId: "useOfficialDiscordContractor",
    tags: ["Contractor Webhooks"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  userAuthorized,
  org_permission("manage_webhooks"),
  async (req, res, next) => {
    await database.updateContractor(
      { contractor_id: req.contractor!.contractor_id },
      {
        official_server_id: "1003056231591727264",
        discord_thread_channel_id: "1072580369251041330",
      },
    )
    res.json(createResponse({ result: "Success" }))
    return
  },
)
