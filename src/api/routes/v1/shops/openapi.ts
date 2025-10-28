import { oapi as oapi } from "../openapi.js"

oapi.schema("Shop", {
  properties: {
    slug: {
      type: "string",
      maxLength: 50,
    },
    name: {
      type: "string",
      maxLength: 100,
    },
    description: {
      type: "string",
      maxLength: 2000,
    },
    banner: {
      type: "string",
      maxLength: 2000,
    },
    logo: {
      type: "string",
      maxLength: 2000,
    },
    owner_type: {
      type: "string",
      enum: ["user", "contractor"],
    },
    owner: {
      oneOf: [
        { type: "string", maxLength: 50, writeOnly: true },
        {
          ...oapi.schema("MinimalContractor"),
          readOnly: true,
        },
        {
          ...oapi.schema("MinimalUser"),
          readOnly: true,
        },
      ],
    },
  },
  required: [
    "slug",
    "name",
    "description",
    "banner",
    "logo",
    "owner_type",
    "owner",
  ],
  additionalProperties: false,
  title: "Shop",
  type: "object",
})

oapi.schema("StorageLocation", {
  properties: {
    id: {
      type: "string",
      readOnly: true,
    },
    name: {
      type: "string",
      maxLength: 100,
    },
    description: {
      type: "string",
      maxLength: 1000,
    },
    shop_slug: {
      type: "string",
    },
    user_id: {
      type: "string",
    },
    listed: {
      type: "boolean",
    },
  },
  required: ["name", "description", "user_id", "shop_slug", "listed"],
  additionalProperties: false,
  title: "StorageLocation",
  type: "object",
})
