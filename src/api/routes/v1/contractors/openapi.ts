import { oapi, Response500 } from "../openapi.js"
import {
  Response400,
  Response401,
  Response403,
  Response404,
  Response409,
  Response429Critical,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"
import { SUPPORTED_LOCALES } from "../util/i18n.js"
import { VALID_ORG_TAGS } from "./controller.js"

// Define AuditLogEntry schema for contractor audit logs
oapi.schema("AuditLogEntry", {
  type: "object",
  title: "AuditLogEntry",
  properties: {
    audit_log_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the audit log entry",
    },
    action: {
      type: "string",
      description: "Action that was performed (e.g., 'org.archived')",
      example: "org.archived",
    },
    actor_id: {
      type: "string",
      format: "uuid",
      nullable: true,
      description: "User ID of the actor who performed the action",
    },
    actor: {
      $ref: "#/components/schemas/MinimalUser",
      nullable: true,
      description: "User details of the actor (if actor_id exists)",
    },
    subject_type: {
      type: "string",
      description: "Type of entity the action was performed on",
      example: "contractor",
    },
    subject_id: {
      type: "string",
      description: "ID of the entity the action was performed on",
    },
    metadata: {
      type: "object",
      description: "Additional metadata about the action",
      additionalProperties: true,
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the action was performed",
    },
  },
  required: [
    "audit_log_id",
    "action",
    "subject_type",
    "subject_id",
    "metadata",
    "created_at",
  ],
})

oapi.schema("AuditLogsResponse", {
  type: "object",
  title: "AuditLogsResponse",
  properties: {
    items: {
      type: "array",
      items: {
        $ref: "#/components/schemas/AuditLogEntry",
      },
    },
    total: {
      type: "integer",
      description: "Total number of audit log entries matching the filters",
    },
    page: {
      type: "integer",
      description: "Current page number",
    },
    page_size: {
      type: "integer",
      description: "Number of items per page",
    },
  },
  required: ["items", "total", "page", "page_size"],
})

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
    manage_blocklist: {
      title: "ContractorRoleBody.manage_blocklist",
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
    "manage_blocklist",
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
    manage_blocklist: {
      title: "ContractorRoleUpdateBody.manage_blocklist",
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
    "manage_blocklist",
  ],
  additionalProperties: false,
  title: "ContractorRoleUpdateBody",
  type: "object",
})

oapi.schema("ContractorKindIconKey", {
  type: "string",
  title: "ContractorKindIconKey",
  enum: [...VALID_ORG_TAGS],
  description: "Contractor specialization/field key used for icons and filtering",
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
    locale: {
      title: "Contractor.locale",
      type: "string",
      enum: [...SUPPORTED_LOCALES],
      description: "Preferred locale for the contractor",
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
    locale: {
      title: "ContractorUpdateBody.locale",
      type: "string",
      enum: [...SUPPORTED_LOCALES],
      description: "Preferred locale for the contractor",
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

export const post_auth_link_spec = oapi.validPath({
  summary: "Verify a contractor with the site",
  deprecated: false,
  description: "",
  operationId: "authLink",
  tags: ["Contractor", "Contractors"],
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "409": Response409,
    "429": Response429Critical,
  },
  security: [],
})

export const post_root_spec = oapi.validPath({
  summary: "Create a new contractor",
  deprecated: false,
  description: "",
  operationId: "createContractor",
  tags: ["Contractor", "Contractors"],
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "409": Response409,
    "429": Response429Critical,
  },
  security: [],
})

export const get_search_query_spec = oapi.validPath({
  summary: "Search contractors",
  deprecated: false,
  description: "",
  operationId: "searchContractors",
  tags: ["Contractor", "Contractors"],
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
      headers: RateLimitHeaders,
    },
    "404": Response404,
    "429": Response429Read,
  },
})

export const get_invites_invite_id_spec = oapi.validPath({
  summary: "Fetch details about a contractor invite",
  deprecated: false,
  description: "",
  operationId: "getInviteCode",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const post_invites_invite_id_accept_spec = oapi.validPath({
  summary: "Accept a contractor invite code",
  deprecated: false,
  description: "",
  operationId: "acceptCodeInvite",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const get_spectrum_id_members_search_query_spec = oapi.validPath({
  summary: "Search contractor members",
  deprecated: false,
  description: "",
  operationId: "searchContractorMembers",
  tags: ["Contractor", "Contractors", "Contractor Members"],
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
})

export const get_spectrum_id_members_csv_spec = oapi.validPath({
  summary: "Export contractor members as CSV",
  deprecated: false,
  description: "Download contractor members list as CSV",
  operationId: "getContractorMembersCsv",
  tags: ["Contractor", "Contractors", "Contractor Members"],
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
})

export const get_spectrum_id_customers_spec = oapi.validPath({
  summary: "Get Contractor Customers",
  deprecated: false,
  description: "",
  operationId: "getContractorCustomers",
  tags: ["Contractor", "Contractors"],
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
})

export const get_spectrum_id_reviews_spec = oapi.validPath({
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
})

export const get_spectrum_id_spec = oapi.validPath({
  summary: "Get a contractor",
  deprecated: false,
  description: "",
  operationId: "getContractor",
  tags: ["Contractor", "Contractors"],
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
})

export const delete_spectrum_id_spec = oapi.validPath({
  summary: "Archive a contractor",
  deprecated: false,
  description:
    "Archive the specified contractor. This action removes members, revokes invites, cancels open orders, and hides the contractor from discovery while preserving historical data.",
  operationId: "archiveContractor",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "Contractor spectrum ID",
      required: true,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
  ],
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            reason: {
              type: "string",
              maxLength: 500,
              description:
                "Optional reason describing why the contractor was archived.",
            },
          },
        },
      },
    },
  },
  responses: {
    "204": {
      description: "Contractor archived successfully",
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "409": Response409,
    "429": Response429Critical,
    "500": Response500,
  },
  security: [],
})

export const get_spectrum_id_audit_logs_spec = oapi.validPath({
  summary: "Get contractor audit logs",
  deprecated: false,
  description:
    "Retrieve a paginated list of audit log entries for this contractor. Only accessible by contractor members. Automatically filtered to show only logs for this contractor.",
  operationId: "getContractorAuditLogs",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "Contractor spectrum ID",
      required: true,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
    {
      name: "page",
      in: "query",
      description: "Page number (1-based)",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        default: 1,
      },
    },
    {
      name: "page_size",
      in: "query",
      description: "Number of audit log entries per page",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
    },
    {
      name: "action",
      in: "query",
      description: "Filter by action type (e.g., 'org.archived')",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "actor_id",
      in: "query",
      description: "Filter by actor user ID",
      required: false,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
    {
      name: "start_date",
      in: "query",
      description: "Filter logs after this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
      },
    },
    {
      name: "end_date",
      in: "query",
      description: "Filter logs before this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
      },
    },
  ],
  responses: {
    "200": {
      description: "Audit logs retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                $ref: "#/components/schemas/AuditLogsResponse",
              },
            },
            required: ["data"],
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
    "500": Response500,
  },
  security: [],
})

export const get_spectrum_id_members_username_spec = oapi.validPath({
  summary: "Check if user is member of contractor",
  deprecated: false,
  description: "Check if a specific user is a member of the contractor",
  operationId: "checkContractorMembership",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "Contractor spectrum ID",
      required: true,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
    {
      name: "username",
      in: "path",
      description: "Username to check",
      required: true,
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "OK - Membership status retrieved",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  is_member: { type: "boolean" },
                  user_id: { type: "string" },
                  username: { type: "string" },
                  roles: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["is_member", "user_id", "username", "roles"],
              },
            },
            required: ["data"],
          },
        },
      },
    },
    "403": Response403,
    "404": Response404,
  },
  security: [],
})

export const get_spectrum_id_members_spec = oapi.validPath({
  summary: "Get contractor members (paginated)",
  deprecated: false,
  description:
    "Get a paginated list of contractor members with search and filtering capabilities",
  operationId: "getContractorMembers",
  tags: ["Contractor", "Contractors", "Contractor Members"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "Contractor spectrum ID",
      required: true,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
    {
      name: "page",
      in: "query",
      description: "Page number (0-based)",
      required: false,
      schema: {
        type: "integer",
        minimum: 0,
        default: 0,
      },
    },
    {
      name: "page_size",
      in: "query",
      description: "Number of items per page",
      required: false,
      schema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
      },
    },
    {
      name: "search",
      in: "query",
      description: "Search by username",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "sort",
      in: "query",
      description: "Sort field",
      required: false,
      schema: {
        type: "string",
        enum: ["username", "role"],
        default: "username",
      },
    },
    {
      name: "role_filter",
      in: "query",
      description: "Filter by role ID",
      required: false,
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "OK - Successful request with paginated members",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  page: { type: "integer" },
                  page_size: { type: "integer" },
                  members: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string" },
                        username: { type: "string" },
                        roles: {
                          type: "array",
                          items: { type: "string" },
                        },
                        avatar: { type: "string" },
                      },
                      required: ["user_id", "username", "roles", "avatar"],
                    },
                  },
                },
                required: ["total", "page", "page_size", "members"],
              },
            },
            required: ["data"],
          },
        },
      },
    },
    "403": Response403,
    "404": Response404,
  },
  security: [],
})

export const post_spectrum_id_roles_spec = oapi.validPath({
  summary: "Create a contractor role",
  deprecated: false,
  description: "",
  operationId: "createContractorRole",
  tags: ["Contractor", "Contractors", "Contractor Roles"],
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
})

export const put_spectrum_id_roles_role_id_spec = oapi.validPath({
  summary: "Update a contractor role",
  deprecated: false,
  description: "",
  operationId: "updateContractorRole",
  tags: ["Contractor", "Contractors", "Contractor Roles"],
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
})

export const delete_spectrum_id_roles_role_id_spec = oapi.validPath({
  summary: "Delete a contractor role",
  deprecated: false,
  description: "",
  operationId: "deleteContractorRole",
  tags: ["Contractor", "Contractors", "Contractor Roles"],
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
})

export const post_spectrum_id_roles_role_id_members_username_spec =
  oapi.validPath({
    summary: "Give a user a contractor role",
    deprecated: false,
    description: "",
    operationId: "giveContractorRole",
    tags: ["Contractor", "Contractors", "Contractor Roles"],
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
  })

export const delete_spectrum_id_roles_role_id_members_username_spec =
  oapi.validPath({
    summary: "Remove a contractor role from a user",
    deprecated: false,
    description: "",
    operationId: "removeContractorRole",
    tags: ["Contractor", "Contractors", "Contractor Roles"],
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
  })

export const delete_spectrum_id_members_username_spec = oapi.validPath({
  summary: "Kick a contractor member",
  deprecated: false,
  description: "",
  operationId: "kickContractorMember",
  tags: ["Contractor", "Contractors", "Contractor Members"],
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
})

export const post_spectrum_id_transfer_ownership_spec = oapi.validPath({
  summary: "Transfer organization ownership",
  deprecated: false,
  description:
    "Transfer ownership of an organization to another member. Only the current owner can perform this action.",
  operationId: "transferOwnership",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "Contractor spectrum ID",
      required: true,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "Username of the member to transfer ownership to",
              example: "newowner",
            },
          },
          required: ["username"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "OK - Ownership successfully transferred",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  result: {
                    type: "string",
                    example: "Success",
                  },
                  message: {
                    type: "string",
                    example: "Ownership transferred to newowner",
                  },
                },
                required: ["result", "message"],
              },
            },
            required: ["data"],
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "409": Response409,
    "500": Response500,
  },
  security: [],
})

export const contractors_post_spectrum_id_avatar_spec = oapi.validPath({
  summary: "Upload organization avatar",
  deprecated: false,
  description:
    "Upload a new avatar image for the organization. The image must be in PNG, JPG, or WEBP format and less than 1MB. The image will be processed through content moderation. User must have manage_org_details permission. Send multipart/form-data with 'avatar' field containing the image file.",
  operationId: "uploadOrganizationAvatar",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Organization spectrum ID",
    },
  ],
  responses: {
    "200": {
      description: "Avatar uploaded successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Avatar uploaded successfully",
              },
              resource_id: { type: "string" },
              url: { type: "string", format: "uri" },
            },
            required: ["result", "resource_id", "url"],
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ userAuth: [] }],
})

export const contractors_post_spectrum_id_banner_spec = oapi.validPath({
  summary: "Upload organization banner",
  deprecated: false,
  description:
    "Upload a new banner image for the organization. The image must be in PNG, JPG, or WEBP format and less than 2.5MB. The image will be processed through content moderation. User must have manage_org_details permission. Send multipart/form-data with 'banner' field containing the image file.",
  operationId: "uploadOrganizationBanner",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Organization spectrum ID",
    },
  ],
  responses: {
    "200": {
      description: "Banner uploaded successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Banner uploaded successfully",
              },
              resource_id: { type: "string" },
              url: { type: "string", format: "uri" },
            },
            required: ["result", "resource_id", "url"],
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
    "500": Response500,
  },
  security: [{ userAuth: [] }],
})

export const put_spectrum_id_spec = oapi.validPath({
  summary: "Update a contractor",
  deprecated: false,
  description:
    "Update contractor details. Note: avatar_url and banner_url are no longer supported. Use /avatar and /banner upload endpoints instead.",
  operationId: "updateContractor",
  tags: ["Contractor", "Contractors"],
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
})

export const post_spectrum_id_webhooks_spec = oapi.validPath({
  summary: "Create a webhook for a contractor",
  deprecated: false,
  description: "",
  operationId: "createContractorWebhook",
  tags: ["OrderWebhook", "Contractor Webhooks"],
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
})

export const delete_spectrum_id_webhooks_webhook_id_spec = oapi.validPath({
  summary: "Delete a contractor webhook",
  deprecated: false,
  description: "Remove a webhook from the contractor",
  operationId: "deleteContractorWebhook",
  tags: ["OrderWebhook", "Contractor Webhooks"],
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
})

export const get_spectrum_id_webhooks_spec = oapi.validPath({
  summary: "Get contractor webhooks",
  deprecated: false,
  description: "",
  operationId: "getContractorWebhooks",
  tags: ["OrderWebhook", "Contractor Webhooks"],
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
})

export const post_spectrum_id_invites_spec = oapi.validPath({
  summary: "Create contractor invite",
  deprecated: false,
  description: "",
  operationId: "createContractorInvite",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const delete_spectrum_id_invites_invite_id_spec = oapi.validPath({
  summary: "Get a contractor invite by ID",
  deprecated: false,
  description: "",
  operationId: "getContractorInviteByID",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const get_spectrum_id_invites_spec = oapi.validPath({
  summary: "Get contractor invites",
  deprecated: false,
  description: "",
  operationId: "getContractorInvites",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const post_spectrum_id_members_spec = oapi.validPath({
  summary: "Invite members to contractor",
  deprecated: false,
  description: "",
  operationId: "contractorInviteMembers",
  tags: ["Contractor", "Contractors", "Contractor Members"],
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
})

export const post_spectrum_id_accept_spec = oapi.validPath({
  summary: "Accept a contractor invite",
  deprecated: false,
  description: "",
  operationId: "acceptContractorInvite",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const post_spectrum_id_decline_spec = oapi.validPath({
  summary: "Decline a contractor invite",
  deprecated: false,
  description: "",
  operationId: "declineContractorInvite",
  tags: ["ContractorInvite", "Contractor Invites"],
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
})

export const get_root_spec = oapi.validPath({
  summary: "Get paginated contractors list",
  description:
    "Get a paginated list of contractors with search, filtering, and sorting capabilities",
  operationId: "getContractors",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "index",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 0, default: 0 },
      description: "Page index for pagination",
    },
    {
      name: "pageSize",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      description: "Number of items per page",
    },
    {
      name: "sorting",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: [
          "name",
          "name-reverse",
          "rating",
          "rating-reverse",
          "created_at",
          "created_at-reverse",
          "members",
          "members-reverse",
          "member_count",
          "date",
          "date-reverse",
        ],
        default: "name",
      },
      description: "Field to sort by",
    },
    {
      name: "reverseSort",
      in: "query",
      required: false,
      schema: { type: "boolean", default: false },
      description: "Reverse the sort order",
    },
    {
      name: "query",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Search query to filter contractors by name or description",
    },
    {
      name: "fields",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Comma-separated list of fields to filter by",
    },
    {
      name: "rating",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Filter by minimum rating",
    },
  ],
  responses: {
    "200": {
      description: "Contractors list retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              total: {
                type: "integer",
                description:
                  "Total number of contractors matching the criteria",
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    contractor_id: { type: "string" },
                    spectrum_id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string", nullable: true },
                    avatar: { type: "string", nullable: true },
                    banner: { type: "string", nullable: true },
                    site_url: { type: "string", nullable: true },
                    locale: { type: "string", nullable: true },
                    market_order_template: { type: "string", nullable: true },
                    created_at: { type: "string", format: "date-time" },
                    updated_at: { type: "string", format: "date-time" },
                    fields: {
                      type: "array",
                      items: { type: "string" },
                      description: "Contractor specialization fields",
                    },
                    rating: {
                      type: "number",
                      nullable: true,
                      description: "Average contractor rating",
                    },
                    roles: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role_id: { type: "string" },
                          name: { type: "string" },
                          position: { type: "number" },
                          permissions: { type: "object" },
                        },
                      },
                      description: "Available contractor roles",
                    },
                  },
                  required: [
                    "contractor_id",
                    "spectrum_id",
                    "name",
                    "created_at",
                    "updated_at",
                    "fields",
                    "roles",
                  ],
                },
              },
            },
            required: ["total", "items"],
          },
        },
      },
    },
    "500": Response500,
  },
})

export const get_spectrum_id_settings_discord_spec = oapi.validPath({
  summary: "Get Discord settings for contractor",
  description: "Get Discord server and channel settings for a contractor",
  operationId: "getContractorDiscordSettings",
  tags: ["Contractor", "Contractors", "Discord"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Contractor spectrum ID",
    },
  ],
  responses: {
    "200": {
      description: "Discord settings retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              guild_avatar: {
                type: "string",
                nullable: true,
                description: "Discord server avatar URL",
              },
              guild_name: {
                type: "string",
                nullable: true,
                description: "Discord server name",
              },
              channel_name: {
                type: "string",
                nullable: true,
                description: "Discord channel name",
              },
              official_server_id: {
                type: "string",
                nullable: true,
                description: "Official Discord server ID",
              },
              discord_thread_channel_id: {
                type: "string",
                nullable: true,
                description: "Discord thread channel ID",
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const post_spectrum_id_settings_discord_use_official_spec =
  oapi.validPath({
    summary: "Use the official server for Discord webhooks",
    deprecated: false,
    description: "",
    operationId: "useOfficialDiscordContractor",
    tags: ["OrderWebhook", "Contractor Webhooks", "Discord"],
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
  })

export const post_spectrum_id_leave_spec = oapi.validPath({
  summary: "Leave a contractor you are a member of",
  deprecated: false,
  description: "",
  operationId: "leaveContractor",
  tags: ["Contractor", "Contractors"],
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
  },
  security: [],
})

export const get_spectrum_id_blocklist_spec = oapi.validPath({
  summary: "Get organization's blocklist",
  description: "Retrieve the list of users blocked by the organization",
  operationId: "getOrgBlocklist",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Organization spectrum ID",
    },
  ],
  responses: {
    "200": {
      description: "OK - Blocklist retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    blocked_id: { type: "string", format: "uuid" },
                    created_at: { type: "string", format: "date-time" },
                    reason: { type: "string" },
                    blocked_user: {
                      type: "object",
                      properties: {
                        username: { type: "string" },
                        display_name: { type: "string" },
                        avatar: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "403": Response403,
    "404": Response404,
  },
  security: [{ userAuth: [] }],
})

export const post_spectrum_id_blocklist_block_spec = oapi.validPath({
  summary: "Block a user for organization",
  description: "Add a user to the organization's blocklist",
  operationId: "blockUserForOrg",
  tags: ["Contractor", "Contractors"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Organization spectrum ID",
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "Username of the user to block",
            },
            reason: {
              type: "string",
              description: "Optional reason for blocking",
            },
          },
          required: ["username"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "OK - User blocked successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
  },
  security: [{ userAuth: [] }],
})

export const delete_spectrum_id_blocklist_unblock_username_spec =
  oapi.validPath({
    summary: "Unblock a user for organization",
    description: "Remove a user from the organization's blocklist",
    operationId: "unblockUserForOrg",
    tags: ["Contractor", "Contractors"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Organization spectrum ID",
      },
      {
        name: "username",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Username of the user to unblock",
      },
    ],
    responses: {
      "200": {
        description: "OK - User unblocked successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [{ userAuth: [] }],
  })
