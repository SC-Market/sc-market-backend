import express from "express"
import { userAuthorized, verifiedUser } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { has_permission } from "../util/permissions.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { serializeService } from "./serializers.js"
import { orderTypes, paymentTypes } from "../orders/helpers.js"
import { createServicePhotos } from "./helpers.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
} from "../openapi.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { valid_contractor } from "../contractors/middleware.js"

export const servicesRouter = express.Router()

oapi.schema("ServiceBody", {
  properties: {
    service_name: {
      title: "ServiceBody.service_name",
      type: "string",
      maxLength: 100,
    },
    service_description: {
      title: "ServiceBody.service_description",
      type: "string",
      maxLength: 2000,
    },
    title: {
      title: "ServiceBody.title",
      type: "string",
      maxLength: 100,
    },
    rush: {
      title: "ServiceBody.rush",
      type: "boolean",
    },
    description: {
      title: "ServiceBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      title: "ServiceBody.kind",
      type: "string",
      enum: orderTypes,
    },
    collateral: {
      title: "ServiceBody.collateral",
      type: "number",
    },
    departure: {
      title: "ServiceBody.departure",
      nullable: true,
      type: "string",
    },
    destination: {
      title: "ServiceBody.destination",
      nullable: true,
      type: "string",
    },
    cost: {
      title: "ServiceBody.cost",
      type: "number",
      minimum: 0,
    },
    payment_type: {
      enum: ["one-time", "daily", "hourly"],
      title: "ServiceBody.payment_type",
      type: "string",
    },
    contractor: {
      title: "ServiceBody.contractor",
      nullable: true,
      type: "string",
    },
    status: {
      title: "ServiceBody.status",
      type: "string",
      enum: ["active", "inactive"],
    },
    photos: {
      items: {
        title: "ServiceBody.photos.[]",
        type: "string",
      },
      title: "ServiceBody.photos",
      type: "array",
      minLength: 1,
    },
  },
  required: [
    "service_name",
    "service_description",
    "title",
    "rush",
    "description",
    "kind",
    "collateral",
    "departure",
    "destination",
    "cost",
    "payment_type",
    "status",
    "photos",
  ],
  additionalProperties: false,
  title: "ServiceBody",
  type: "object",
})

servicesRouter.post(
  "",
  verifiedUser,
  oapi.validPath({
    summary: "Create a new service",
    deprecated: false,
    description: "",
    operationId: "createService",
    tags: ["Services"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("ServiceBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {},
              type: "object",
              title: "CreateServiceCreated",
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
  }),
  async (req, res) => {
    const user = req.user as User

    const {
      service_name,
      service_description,
      kind,
      description,
      cost,
      title,
      contractor,
      rush,
      departure,
      destination,
      collateral,
      payment_type,
      photos,
      status,
    }: {
      service_name: string
      service_description: string
      title: string
      rush: boolean
      description: string
      kind: string
      collateral: number
      departure: string | null
      destination: string | null
      cost: number
      contractor?: string | null
      payment_type: string
      photos: string[]
      status: string
    } = req.body

    let contractor_id
    if (contractor) {
      const contractor_obj = await database.getContractor({
        spectrum_id: contractor,
      })
      if (!contractor_obj) {
        res
          .status(400)
          .json(createErrorResponse({ error: "Invalid contractor" }))
        return
      }
      contractor_id = contractor_obj.contractor_id

      if (
        !(await has_permission(contractor_id, user.user_id, "manage_orders"))
      ) {
        res.status(403).json(createErrorResponse({ error: "No permissions" }))
        return
      }
    } else {
      contractor_id = null
    }

    const [service] = await database.createService({
      service_name: service_name,
      service_description: service_description,
      kind: kind || null,
      description: description,
      cost: cost,
      title: title,
      contractor_id: contractor_id,
      rush: rush || false,
      departure: departure,
      destination: destination,
      collateral: collateral || 0,
      payment_type: payment_type as "one-time" | "hourly" | "daily",
      user_id: contractor_id ? undefined : user.user_id,
      status,
    })

    try {
      await createServicePhotos(service.service_id, photos)
    } catch {}

    res.json(createResponse({ result: "Success" }))
  },
)

servicesRouter.get(
  "/user/:username",
  oapi.validPath({
    summary: "Get services by user",
    deprecated: false,
    description: "",
    operationId: "getServicesByUser",
    tags: ["Services"],
    parameters: [
      {
        name: "username",
        in: "path",
        description: "The username of the user",
        required: true,
        example: "Khuzdul",
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
                  items: oapi.schema("Service"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetServicesByUserOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const username = req.params["username"]

    let target
    try {
      target = await database.getUser(
        { username: username },
        { noBalance: true },
      )
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid user" }))
      return
    }

    const isOwner = user && username === user.username

    if (isOwner) {
      const services = await database.getServices({
        user_id: target.user_id,
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    } else {
      const services = await database.getServices({
        user_id: target.user_id,
        status: "active",
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    }
  },
)

servicesRouter.get(
  "/public",
  oapi.validPath({
    summary: "Get public services",
    deprecated: false,
    description: "",
    operationId: "getPublicServices",
    tags: ["Services"],
    parameters: [],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("Service"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetPublicServicesOk",
            },
          },
        },
        headers: {},
      },
    },
  }),
  async (req, res, next) => {
    const services = await database.getServices({
      status: "active",
    })
    res.json(createResponse(await Promise.all(services.map(serializeService))))
  },
)

servicesRouter.get(
  "/contractor/:spectrum_id",
  userAuthorized,
  oapi.validPath({
    summary: "Get services by contractor",
    deprecated: false,
    description: "",
    operationId: "getServicesByContractor",
    tags: ["Services"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "The Spectrum ID of the contractor",
        required: true,
        example: "SCMARKET",
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
                  items: oapi.schema("Service"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetServicesByContractorOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  valid_contractor,
  async (req, res) => {
    const user = req.user as User

    const isAdmin =
      user &&
      (await has_permission(
        req.contractor!.contractor_id,
        user.user_id,
        "manage_orders",
      ))
    if (isAdmin) {
      const services = await database.getServices({
        contractor_id: req.contractor!.contractor_id,
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    } else {
      const services = await database.getServices({
        contractor_id: req.contractor!.contractor_id,
        status: "active",
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    }
  },
)

servicesRouter.put(
  "/:service_id",
  userAuthorized,
  oapi.validPath({
    summary: "Update a service",
    deprecated: false,
    description: "",
    operationId: "updateService",
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
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
          schema: oapi.schema("ServiceBody"),
        },
      },
    },
    responses: {
      "204": {
        description: "Updated - Resource successfully updated",
        content: {
          "application/json": {
            schema: {
              properties: {},
              type: "object",
              title: "UpdateServiceUpdated",
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
  }),
  async (req, res) => {
    const user = req.user as User
    const service_id = req.params["service_id"]

    let service
    try {
      service = await database.getService({ service_id })
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    if (!service) {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    const {
      service_name,
      service_description,
      kind,
      description,
      cost,
      title,
      rush,
      departure,
      destination,
      collateral,
      status,
      photos,
    }: {
      service_name: string
      service_description: string
      title: string
      rush: boolean
      description: string
      kind: string
      collateral: number
      departure: string | null
      destination: string | null
      cost: number
      status: string
      photos: string[]
    } = req.body

    if (service.contractor_id) {
      const contractor = await database.getContractor({
        contractor_id: service.contractor_id,
      })

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        res.status(400).json(createErrorResponse({ error: "No permissions!" }))
        return
      }
    } else {
      if (service.user_id !== user.user_id) {
        res.status(400).json(createErrorResponse({ error: "No permissions!" }))
        return
      }
    }

    await database.updateService(
      { service_id },
      {
        service_name,
        service_description,
        kind: kind || null,
        description: description,
        cost: cost,
        title: title,
        rush: rush || false,
        departure: departure,
        destination: destination,
        collateral: collateral || 0,
        status: status,
      },
    )

    const old_photos = await database.getServiceListingImages({ service_id })

    for (const photo of photos) {
      try {
        const resource = await cdn.createExternalResource(
          photo,
          service_id + `_photo_${0}`,
        )
        await database.insertServiceImage({
          resource_id: resource.resource_id,
          service_id,
        })
      } catch (e: any) {
        res.status(400).json(createErrorResponse({ error: "Invalid photo!" }))
        return
      }
    }

    for (const p of old_photos) {
      await database.deleteServiceImages(p)
      try {
        await database.removeImageResource({ resource_id: p.resource_id })
      } catch {}
    }

    res.json(createResponse({ result: "Success" }))
  },
)

servicesRouter.get(
  "/:service_id",
  oapi.validPath({
    summary: "Get a service by ID",
    deprecated: false,
    description: "",
    operationId: "getServiceById",
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
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
            schema: oapi.schema("Service"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "404": Response404,
    },
    security: [],
  }),
  async (req, res, next) => {
    const service_id = req.params["service_id"]

    let service
    try {
      service = await database.getService({ service_id })
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    if (!service) {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    res.json(createResponse(await serializeService(service)))
  },
)
