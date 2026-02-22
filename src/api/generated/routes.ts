/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WikiController } from './../controllers/wiki.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { UploadController } from './../controllers/upload.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TokensController } from './../controllers/tokens.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { StarmapController } from './../controllers/starmap.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ShopsController } from './../controllers/shops.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ServicesController } from './../controllers/services.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { RecruitingController } from './../controllers/recruiting.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PushController } from './../controllers/push.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PrometheusController } from './../controllers/prometheus.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProfileController } from './../controllers/profile.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OrdersController } from './../controllers/orders.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OffersController } from './../controllers/offers.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { NotificationsController } from './../controllers/notifications.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ModerationController } from './../controllers/moderation.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarketListingsController } from './../controllers/market-listings.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../controllers/health.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { EmailController } from './../controllers/email.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DeliveriesController } from './../controllers/deliveries.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ContractsController } from './../controllers/contracts.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ContractorsController } from './../controllers/contractors.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CommoditiesController } from './../controllers/commodities.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CommentsController } from './../controllers/comments.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ChatsController } from './../controllers/chats.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AttributesController } from './../controllers/attributes.controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AdminController } from './../controllers/admin.controller.js';
import { expressAuthentication } from './../middleware/tsoa-auth.js';
// @ts-ignore - no great way to install types from subpackage
import { iocContainer } from './../ioc.js';
import type { IocContainer, IocContainerFactory } from '@tsoa/runtime';
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';
import multer from 'multer';


const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "WikiThumbnail": {
        "dataType": "refObject",
        "properties": {
            "mimetype": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "width": {"dataType":"double","required":true},
            "height": {"dataType":"double","required":true},
            "duration": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "url": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiImageInfo": {
        "dataType": "refObject",
        "properties": {
            "url": {"dataType":"string","required":true},
            "thumburl": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiImageDetails": {
        "dataType": "refObject",
        "properties": {
            "pages": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"imageinfo":{"dataType":"array","array":{"dataType":"refObject","ref":"WikiImageInfo"}}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiImageSearchResult": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"double","required":true},
            "key": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "excerpt": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "matched_title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "thumbnail": {"dataType":"union","subSchemas":[{"ref":"WikiThumbnail"},{"dataType":"enum","enums":[null]}],"required":true},
            "images": {"dataType":"union","subSchemas":[{"ref":"WikiImageDetails"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiImageSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"WikiImageSearchResult"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ValidationErrorDetail": {
        "dataType": "refObject",
        "properties": {
            "field": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "code": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ValidationErrorResponse": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"validationErrors":{"dataType":"array","array":{"dataType":"refObject","ref":"ValidationErrorDetail"}},"details":{"ref":"Record_string.any_"},"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["VALIDATION_ERROR"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ErrorResponse": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"validationErrors":{"dataType":"array","array":{"dataType":"refObject","ref":"ValidationErrorDetail"}},"details":{"ref":"Record_string.any_"},"message":{"dataType":"string","required":true},"code":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiCategory": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiPageInfo": {
        "dataType": "refObject",
        "properties": {
            "pageid": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "extract": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "thumbnail": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"source":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
            "categories": {"dataType":"array","array":{"dataType":"refObject","ref":"WikiCategory"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiItemSearchResult": {
        "dataType": "refObject",
        "properties": {
            "query": {"dataType":"nestedObjectLiteral","nestedProperties":{"pages":{"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"ref":"WikiPageInfo"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiItemSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"WikiItemSearchResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PhotoUploadData": {
        "dataType": "refObject",
        "properties": {
            "resource_id": {"dataType":"string","required":true},
            "url": {"dataType":"string","required":true},
            "filename": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "mimetype": {"dataType":"string","required":true},
            "uploaded_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PhotoUploadResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"PhotoUploadData","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ValidationErrorClass": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "stack": {"dataType":"string"},
            "fields": {"ref":"Record_string.string_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Unauthorized": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["UNAUTHORIZED"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Forbidden": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["FORBIDDEN"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenScope": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["profile:read"]},{"dataType":"enum","enums":["profile:write"]},{"dataType":"enum","enums":["market:read"]},{"dataType":"enum","enums":["market:write"]},{"dataType":"enum","enums":["market:purchase"]},{"dataType":"enum","enums":["market:photos"]},{"dataType":"enum","enums":["orders:read"]},{"dataType":"enum","enums":["orders:write"]},{"dataType":"enum","enums":["orders:reviews"]},{"dataType":"enum","enums":["contractors:read"]},{"dataType":"enum","enums":["contractors:write"]},{"dataType":"enum","enums":["contractors:members"]},{"dataType":"enum","enums":["contractors:webhooks"]},{"dataType":"enum","enums":["contractors:blocklist"]},{"dataType":"enum","enums":["orgs:read"]},{"dataType":"enum","enums":["orgs:write"]},{"dataType":"enum","enums":["orgs:manage"]},{"dataType":"enum","enums":["services:read"]},{"dataType":"enum","enums":["services:write"]},{"dataType":"enum","enums":["services:photos"]},{"dataType":"enum","enums":["offers:read"]},{"dataType":"enum","enums":["offers:write"]},{"dataType":"enum","enums":["chats:read"]},{"dataType":"enum","enums":["chats:write"]},{"dataType":"enum","enums":["notifications:read"]},{"dataType":"enum","enums":["notifications:write"]},{"dataType":"enum","enums":["moderation:read"]},{"dataType":"enum","enums":["moderation:write"]},{"dataType":"enum","enums":["admin:read"]},{"dataType":"enum","enums":["admin:write"]},{"dataType":"enum","enums":["admin:spectrum"]},{"dataType":"enum","enums":["admin:stats"]},{"dataType":"enum","enums":["readonly"]},{"dataType":"enum","enums":["full"]},{"dataType":"enum","enums":["admin"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApiToken": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "scopes": {"dataType":"array","array":{"dataType":"refAlias","ref":"TokenScope"},"required":true},
            "contractor_spectrum_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "expires_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "last_used_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenCreationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"data":{"ref":"ApiToken","required":true},"token":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateTokenPayload": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "scopes": {"dataType":"array","array":{"dataType":"refAlias","ref":"TokenScope"},"required":true},
            "expires_at": {"dataType":"string"},
            "contractor_spectrum_ids": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"ApiToken"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"ApiToken","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotFound": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"details":{"dataType":"nestedObjectLiteral","nestedProperties":{"identifier":{"dataType":"string"},"resource":{"dataType":"string"}}},"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["NOT_FOUND"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateTokenPayload": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "description": {"dataType":"string"},
            "scopes": {"dataType":"array","array":{"dataType":"refAlias","ref":"TokenScope"}},
            "expires_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "contractor_spectrum_ids": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenRevocationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenExtensionResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ExtendTokenPayload": {
        "dataType": "refObject",
        "properties": {
            "expires_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenStatsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"expires_at":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"last_used_at":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"created_at":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AvailableScopesResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"scopes":{"dataType":"array","array":{"dataType":"refAlias","ref":"TokenScope"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StarmapRoute": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RouteResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"StarmapRoute","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StarmapObject": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ObjectResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"StarmapObject","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StarmapSearchResult": {
        "dataType": "refObject",
        "properties": {
            "results": {"dataType":"array","array":{"dataType":"refObject","ref":"StarmapObject"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"StarmapSearchResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopOwnerType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MinimalContractor": {
        "dataType": "refObject",
        "properties": {
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MinimalUser": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "avatar": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopOwner": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"ref":"MinimalUser"}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Shop": {
        "dataType": "refObject",
        "properties": {
            "slug": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "banner": {"dataType":"string","required":true},
            "logo": {"dataType":"string","required":true},
            "owner_type": {"ref":"ShopOwnerType","required":true},
            "owner": {"ref":"ShopOwner","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"Shop"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Shop","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopCreationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"slug":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateShopRequest": {
        "dataType": "refObject",
        "properties": {
            "slug": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "banner": {"dataType":"string","required":true},
            "logo": {"dataType":"string","required":true},
            "owner_type": {"ref":"ShopOwnerType","required":true},
            "owner": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShopUpdateResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateShopRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "description": {"dataType":"string"},
            "banner": {"dataType":"string"},
            "logo": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceCreationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"service_id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceKind": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]},{"dataType":"enum","enums":["archived"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateServiceRequest": {
        "dataType": "refObject",
        "properties": {
            "service_name": {"dataType":"string","required":true},
            "service_description": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "kind": {"ref":"ServiceKind"},
            "cost": {"dataType":"double","required":true},
            "rush": {"dataType":"boolean"},
            "departure": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "destination": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "collateral": {"dataType":"double"},
            "payment_type": {"ref":"PaymentType","required":true},
            "status": {"ref":"ServiceStatus","required":true},
            "contractor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "photos": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Service": {
        "dataType": "refObject",
        "properties": {
            "service_id": {"dataType":"string","required":true},
            "service_name": {"dataType":"string","required":true},
            "service_description": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "kind": {"ref":"ServiceKind","required":true},
            "cost": {"dataType":"double","required":true},
            "rush": {"dataType":"boolean","required":true},
            "departure": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "destination": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "collateral": {"dataType":"double","required":true},
            "payment_type": {"ref":"PaymentType","required":true},
            "status": {"ref":"ServiceStatus","required":true},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "user_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "photos": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "timestamp": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "contractor": {"dataType":"any"},
            "user": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"Service"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServicePaginatedResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"pagination":{"dataType":"nestedObjectLiteral","nestedProperties":{"totalPages":{"dataType":"double","required":true},"total":{"dataType":"double","required":true},"pageSize":{"dataType":"double","required":true},"page":{"dataType":"double","required":true}},"required":true},"data":{"dataType":"array","array":{"dataType":"refObject","ref":"Service"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceUpdateResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateServiceRequest": {
        "dataType": "refObject",
        "properties": {
            "service_name": {"dataType":"string"},
            "service_description": {"dataType":"string"},
            "title": {"dataType":"string"},
            "description": {"dataType":"string"},
            "kind": {"ref":"ServiceKind"},
            "cost": {"dataType":"double"},
            "rush": {"dataType":"boolean"},
            "departure": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "destination": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "collateral": {"dataType":"double"},
            "payment_type": {"ref":"PaymentType"},
            "status": {"ref":"ServiceStatus"},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Service","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServicePhotoUploadResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"photos":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"url":{"dataType":"string","required":true},"resource_id":{"dataType":"string","required":true}}},"required":true},"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceViewResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceAnalyticsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"user_id":{"dataType":"string","required":true},"time_period":{"dataType":"string","required":true},"total_service_views":{"dataType":"double","required":true},"services":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"unique_viewers":{"dataType":"double","required":true},"views":{"dataType":"double","required":true},"service_name":{"dataType":"string","required":true},"service_id":{"dataType":"string","required":true}}},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecruitingPost": {
        "dataType": "refObject",
        "properties": {
            "post_id": {"dataType":"string","required":true},
            "contractor": {"dataType":"any","required":true},
            "title": {"dataType":"string","required":true},
            "body": {"dataType":"string","required":true},
            "timestamp": {"dataType":"string","required":true},
            "upvotes": {"dataType":"double","required":true},
            "downvotes": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecruitingPostsListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"items":{"dataType":"array","array":{"dataType":"refObject","ref":"RecruitingPost"},"required":true},"total":{"dataType":"double","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecruitingPostResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"RecruitingPost","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Conflict": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"details":{"ref":"Record_string.any_"},"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["CONFLICT"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateRecruitingPostPayload": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "body": {"dataType":"string","required":true},
            "contractor": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CommentsListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"any"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateRecruitingPostPayload": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "body": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpvoteResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string","required":true},
            "already_voted": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SuccessMessageResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateCommentPayload": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string","required":true},
            "reply_to": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushSubscriptionResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"subscription_id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ServiceUnavailable": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"code":{"dataType":"enum","enums":["SERVICE_UNAVAILABLE"],"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushSubscriptionKeys": {
        "dataType": "refObject",
        "properties": {
            "p256dh": {"dataType":"string","required":true},
            "auth": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushSubscriptionPayload": {
        "dataType": "refObject",
        "properties": {
            "endpoint": {"dataType":"string","required":true},
            "keys": {"ref":"PushSubscriptionKeys","required":true},
            "userAgent": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushSubscription": {
        "dataType": "refObject",
        "properties": {
            "subscription_id": {"dataType":"string","required":true},
            "user_id": {"dataType":"string","required":true},
            "endpoint": {"dataType":"string","required":true},
            "p256dh": {"dataType":"string","required":true},
            "auth": {"dataType":"string","required":true},
            "user_agent": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "created_at": {"dataType":"string","required":true},
            "last_used_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushSubscriptionsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"subscriptions":{"dataType":"array","array":{"dataType":"refObject","ref":"PushSubscription"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushOperationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushPreference": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"string","required":true},
            "enabled": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationPushPreferences": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"string","required":true},
            "preferences": {"dataType":"array","array":{"dataType":"refObject","ref":"PushPreference"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GroupedPushPreferences": {
        "dataType": "refObject",
        "properties": {
            "individual": {"dataType":"array","array":{"dataType":"refObject","ref":"PushPreference"},"required":true},
            "organizations": {"dataType":"array","array":{"dataType":"refObject","ref":"OrganizationPushPreferences"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PushPreferencesResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"preferences":{"ref":"GroupedPushPreferences","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdatePushPreferencePayload": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"string"},
            "enabled": {"dataType":"boolean"},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "preferences": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"contractor_id":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"enabled":{"dataType":"boolean","required":true},"action":{"dataType":"string","required":true}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrometheusQueryResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"array","array":{"dataType":"any"},"required":true},"resultType":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrometheusErrorResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "errorType": {"dataType":"string","required":true},
            "error": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrometheusLabelValuesResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PrometheusSeriesResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"any"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserProfile": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
            "display_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "banner": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "bio": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "rsi_handle": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "rsi_confirmed": {"dataType":"boolean","required":true},
            "discord_username": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "role": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["admin"]}],"required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProfileResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"profile":{"ref":"UserProfile","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateProfilePayload": {
        "dataType": "refObject",
        "properties": {
            "display_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "bio": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "banner": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProfileSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"profiles":{"dataType":"array","array":{"dataType":"refObject","ref":"UserProfile"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["not-started"]},{"dataType":"enum","enums":["in-progress"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderStub": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"dataType":"enum","enums":[null]}],"required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "customer": {"ref":"MinimalUser","required":true},
            "status": {"ref":"OrderStatus","required":true},
            "timestamp": {"dataType":"string","required":true},
            "service_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "cost": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "payment_type": {"ref":"PaymentType","required":true},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"item_counts":{"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"double"},"required":true},"items":{"dataType":"array","array":{"dataType":"refObject","ref":"OrderStub"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderMetricsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"top_customers":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"total_value":{"dataType":"double","required":true},"order_count":{"dataType":"double","required":true},"username":{"dataType":"string","required":true}}},"required":true},"recent_activity":{"dataType":"nestedObjectLiteral","nestedProperties":{"value_last_30_days":{"dataType":"double","required":true},"value_last_7_days":{"dataType":"double","required":true},"orders_last_30_days":{"dataType":"double","required":true},"orders_last_7_days":{"dataType":"double","required":true}},"required":true},"status_counts":{"dataType":"nestedObjectLiteral","nestedProperties":{"cancelled":{"dataType":"double","required":true},"fulfilled":{"dataType":"double","required":true},"in-progress":{"dataType":"double","required":true},"not-started":{"dataType":"double","required":true}},"required":true},"completed_value":{"dataType":"double","required":true},"active_value":{"dataType":"double","required":true},"total_value":{"dataType":"double","required":true},"total_orders":{"dataType":"double","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorOrderDataResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"recent_orders":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"cost":{"dataType":"double","required":true},"status":{"dataType":"string","required":true},"timestamp":{"dataType":"string","required":true},"order_id":{"dataType":"string","required":true}}}},"metrics":{"dataType":"nestedObjectLiteral","nestedProperties":{"trend_data":{"dataType":"nestedObjectLiteral","nestedProperties":{"status_trends":{"dataType":"nestedObjectLiteral","nestedProperties":{"cancelled":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true},"fulfilled":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true},"in-progress":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true},"not-started":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true}},"required":true},"daily_value":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"value":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true},"daily_orders":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"date":{"dataType":"string","required":true}}},"required":true}}},"top_customers":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"total_value":{"dataType":"double","required":true},"order_count":{"dataType":"double","required":true},"username":{"dataType":"string","required":true}}},"required":true},"recent_activity":{"dataType":"nestedObjectLiteral","nestedProperties":{"value_last_30_days":{"dataType":"double","required":true},"value_last_7_days":{"dataType":"double","required":true},"orders_last_30_days":{"dataType":"double","required":true},"orders_last_7_days":{"dataType":"double","required":true}},"required":true},"status_counts":{"dataType":"nestedObjectLiteral","nestedProperties":{"cancelled":{"dataType":"double","required":true},"fulfilled":{"dataType":"double","required":true},"in-progress":{"dataType":"double","required":true},"not-started":{"dataType":"double","required":true}},"required":true},"completed_value":{"dataType":"double","required":true},"active_value":{"dataType":"double","required":true},"total_value":{"dataType":"double","required":true},"total_orders":{"dataType":"double","required":true}},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserOrderDataResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"total_orders":{"dataType":"double","required":true},"total_spent":{"dataType":"string","required":true},"orders":{"dataType":"array","array":{"dataType":"refObject","ref":"OrderStub"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderKind": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["service"]},{"dataType":"enum","enums":["delivery"]},{"dataType":"enum","enums":["escort"]},{"dataType":"enum","enums":["other"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Order": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "kind": {"ref":"OrderKind","required":true},
            "cost": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "customer": {"ref":"MinimalUser","required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"dataType":"enum","enums":[null]}],"required":true},
            "timestamp": {"dataType":"string","required":true},
            "status": {"ref":"OrderStatus","required":true},
            "collateral": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "departure": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "destination": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "service_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "rush": {"dataType":"boolean","required":true},
            "payment_type": {"ref":"PaymentType","required":true},
            "thread_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "offer_session_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Order","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrderResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"discord_invite":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"session_id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrderPayload": {
        "dataType": "refObject",
        "properties": {
            "kind": {"ref":"OrderKind","required":true},
            "cost": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "contractor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "assigned_to": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "collateral": {"dataType":"double"},
            "service_id": {"dataType":"string"},
            "payment_type": {"ref":"PaymentType","required":true},
            "rush": {"dataType":"boolean"},
            "departure": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "destination": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SuccessResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOrderPayload": {
        "dataType": "refObject",
        "properties": {
            "status": {"ref":"OrderStatus"},
            "assigned_to": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "contractor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApplyToOrderPayload": {
        "dataType": "refObject",
        "properties": {
            "contractor": {"dataType":"string"},
            "message": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "session_id": {"dataType":"string","required":true},
            "actor_id": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "cost": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "service_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "payment_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]}],"required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "market_listings": {"dataType":"array","array":{"dataType":"any"}},
            "service": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferSessionResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "customer_id": {"dataType":"string","required":true},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "assigned_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"dataType":"string","required":true},
            "thread_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferResponse"},"required":true},
            "customer": {"dataType":"any"},
            "contractor": {"dataType":"any"},
            "assigned": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AcceptOfferResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferSuccessResponse": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"enum","enums":["Success"],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferMarketListing": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CounterOfferRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "cost": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "service_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "market_listings": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferMarketListing"},"required":true},
            "payment_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateOfferSessionRequest": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["accepted"]},{"dataType":"enum","enums":["rejected"]},{"dataType":"enum","enums":["cancelled"]},{"dataType":"enum","enums":["counteroffered"]}],"required":true},
            "counter_offer": {"ref":"CounterOfferRequest"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateThreadResponse": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"enum","enums":["Success"],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateThreadRequest": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferSessionStub": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "customer_id": {"dataType":"string","required":true},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "assigned_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "most_recent_offer": {"dataType":"nestedObjectLiteral","nestedProperties":{"kind":{"dataType":"string","required":true},"cost":{"dataType":"string","required":true},"title":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "item_counts": {"dataType":"nestedObjectLiteral","nestedProperties":{"filtered":{"dataType":"double","required":true},"total":{"dataType":"double","required":true}},"required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferSessionStub"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MergeOffersResponse": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"enum","enums":["Success"],"required":true},
            "merged_offer_session": {"ref":"OfferSessionResponse","required":true},
            "source_offer_session_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MergeOffersRequest": {
        "dataType": "refObject",
        "properties": {
            "offer_session_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Notification": {
        "dataType": "refObject",
        "properties": {
            "notification_id": {"dataType":"string","required":true},
            "notifier_id": {"dataType":"string","required":true},
            "action": {"dataType":"string","required":true},
            "entity": {"dataType":"string","required":true},
            "entity_id": {"dataType":"string","required":true},
            "read": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "actor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "actor_username": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "contractor_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "contractor_spectrum_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaginatedNotificationsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"unread_count":{"dataType":"double","required":true},"total_pages":{"dataType":"double","required":true},"total_count":{"dataType":"double","required":true},"page_size":{"dataType":"double","required":true},"page":{"dataType":"double","required":true},"notifications":{"dataType":"array","array":{"dataType":"refObject","ref":"Notification"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true},"success":{"dataType":"boolean","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateNotificationPayload": {
        "dataType": "refObject",
        "properties": {
            "read": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkOperationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"affected_count":{"dataType":"double","required":true},"message":{"dataType":"string","required":true},"success":{"dataType":"boolean","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkDeleteNotificationsPayload": {
        "dataType": "refObject",
        "properties": {
            "notification_ids": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateReportResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"report_id":{"dataType":"string","required":true},"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReportReason": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["inappropriate_content"]},{"dataType":"enum","enums":["spam"]},{"dataType":"enum","enums":["harassment"]},{"dataType":"enum","enums":["fake_listing"]},{"dataType":"enum","enums":["scam"]},{"dataType":"enum","enums":["copyright_violation"]},{"dataType":"enum","enums":["other"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateReportPayload": {
        "dataType": "refObject",
        "properties": {
            "reported_url": {"dataType":"string","required":true},
            "report_reason": {"ref":"ReportReason"},
            "report_details": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReportStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["in_progress"]},{"dataType":"enum","enums":["resolved"]},{"dataType":"enum","enums":["dismissed"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContentReport": {
        "dataType": "refObject",
        "properties": {
            "report_id": {"dataType":"string","required":true},
            "reported_url": {"dataType":"string","required":true},
            "report_reason": {"dataType":"union","subSchemas":[{"ref":"ReportReason"},{"dataType":"enum","enums":[null]}],"required":true},
            "report_details": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "status": {"ref":"ReportStatus","required":true},
            "created_at": {"dataType":"string","required":true},
            "handled_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "notes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetUserReportsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"reports":{"dataType":"array","array":{"dataType":"refObject","ref":"ContentReport"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ModerationRating": {
        "dataType": "refObject",
        "properties": {
            "avg_rating": {"dataType":"double","required":true},
            "rating_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ModerationBadgeData": {
        "dataType": "refObject",
        "properties": {
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ModerationUser": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "avatar": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "rating": {"ref":"ModerationRating","required":true},
            "badges": {"dataType":"union","subSchemas":[{"ref":"ModerationBadgeData"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AdminContentReport": {
        "dataType": "refObject",
        "properties": {
            "report_id": {"dataType":"string","required":true},
            "reported_url": {"dataType":"string","required":true},
            "report_reason": {"dataType":"union","subSchemas":[{"ref":"ReportReason"},{"dataType":"enum","enums":[null]}],"required":true},
            "report_details": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "status": {"ref":"ReportStatus","required":true},
            "created_at": {"dataType":"string","required":true},
            "handled_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "notes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "reporter": {"ref":"ModerationUser","required":true},
            "handled_by": {"dataType":"union","subSchemas":[{"ref":"ModerationUser"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaginationMetadata": {
        "dataType": "refObject",
        "properties": {
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
            "total_reports": {"dataType":"double","required":true},
            "total_pages": {"dataType":"double","required":true},
            "has_next": {"dataType":"boolean","required":true},
            "has_prev": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetAdminReportsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"pagination":{"ref":"PaginationMetadata","required":true},"reports":{"dataType":"array","array":{"dataType":"refObject","ref":"AdminContentReport"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateReportResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"report":{"ref":"AdminContentReport","required":true},"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateReportPayload": {
        "dataType": "refObject",
        "properties": {
            "status": {"ref":"ReportStatus","required":true},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarketListing": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "listing_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unique"]},{"dataType":"enum","enums":["aggregate"]},{"dataType":"enum","enums":["multiple"]}],"required":true},
            "sale_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["sale"]},{"dataType":"enum","enums":["auction"]}],"required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["archived"]},{"dataType":"enum","enums":["expired"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "item_type": {"dataType":"string","required":true},
            "item_name": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "photos": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "user_seller_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor_seller_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "internal": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "expires_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "minimum_bid_increment": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "current_bid": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarketListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"limit":{"dataType":"double","required":true},"page":{"dataType":"double","required":true},"total":{"dataType":"double","required":true},"listings":{"dataType":"array","array":{"dataType":"refObject","ref":"MarketListing"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarketListingResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"listing":{"ref":"MarketListing","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateMarketListingPayload": {
        "dataType": "refObject",
        "properties": {
            "listing_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unique"]},{"dataType":"enum","enums":["aggregate"]},{"dataType":"enum","enums":["multiple"]}],"required":true},
            "sale_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["sale"]},{"dataType":"enum","enums":["auction"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "item_type": {"dataType":"string","required":true},
            "item_name": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
            "internal": {"dataType":"boolean"},
            "contractor_seller_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "expires_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "minimum_bid_increment": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateMarketListingPayload": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["archived"]},{"dataType":"enum","enums":["expired"]}]},
            "title": {"dataType":"string"},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "item_type": {"dataType":"string"},
            "item_name": {"dataType":"string"},
            "price": {"dataType":"double"},
            "quantity_available": {"dataType":"double"},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
            "minimum_bid_increment": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "internal": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingStats": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "views": {"dataType":"double","required":true},
            "orders": {"dataType":"double","required":true},
            "revenue": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingStatsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"stats":{"dataType":"array","array":{"dataType":"refObject","ref":"ListingStats"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateQuantityResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"quantity_available":{"dataType":"double","required":true},"listing_id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateQuantityPayload": {
        "dataType": "refObject",
        "properties": {
            "quantity_available": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RefreshListingResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"expires_at":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TrackViewResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"success":{"dataType":"boolean","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmailNotificationType": {
        "dataType": "refObject",
        "properties": {
            "action_type_id": {"dataType":"double","required":true},
            "action": {"dataType":"string","required":true},
            "entity": {"dataType":"string","required":true},
            "description": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationTypesResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"notificationTypes":{"dataType":"array","array":{"dataType":"refObject","ref":"EmailNotificationType"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmailPreference": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"string","required":true},
            "enabled": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrganizationEmailPreferences": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"string","required":true},
            "preferences": {"dataType":"array","array":{"dataType":"refObject","ref":"EmailPreference"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GroupedEmailPreferences": {
        "dataType": "refObject",
        "properties": {
            "individual": {"dataType":"array","array":{"dataType":"refObject","ref":"EmailPreference"},"required":true},
            "organizations": {"dataType":"array","array":{"dataType":"refObject","ref":"OrganizationEmailPreferences"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserEmailInfo": {
        "dataType": "refObject",
        "properties": {
            "email_id": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "email_verified": {"dataType":"boolean","required":true},
            "is_primary": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmailPreferencesResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"email":{"dataType":"union","subSchemas":[{"ref":"UserEmailInfo"},{"dataType":"enum","enums":[null]}],"required":true},"preferences":{"ref":"GroupedEmailPreferences","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EmailOperationResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateEmailPreferencePayload": {
        "dataType": "refObject",
        "properties": {
            "action": {"dataType":"string"},
            "enabled": {"dataType":"boolean"},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "preferences": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"contractor_id":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"enabled":{"dataType":"boolean","required":true},"action":{"dataType":"string","required":true}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDeliveryResponse": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"enum","enums":["Success"],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateDeliveryRequest": {
        "dataType": "refObject",
        "properties": {
            "start": {"dataType":"string","required":true},
            "end": {"dataType":"string","required":true},
            "order_id": {"dataType":"string","required":true},
            "ship_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeliveryResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "departure": {"dataType":"string","required":true},
            "destination": {"dataType":"string","required":true},
            "order_id": {"dataType":"string","required":true},
            "ship_id": {"dataType":"string","required":true},
            "progress": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "order": {"dataType":"any"},
            "ship": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContractResponse": {
        "dataType": "refObject",
        "properties": {
            "contract_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContractRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "departure": {"dataType":"string","required":true},
            "destination": {"dataType":"string","required":true},
            "cost": {"dataType":"string","required":true},
            "payment_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]}],"required":true},
            "kind": {"dataType":"string","required":true},
            "collateral": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContractOfferResponse": {
        "dataType": "refObject",
        "properties": {
            "session_id": {"dataType":"string","required":true},
            "discord_invite": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContractOfferRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "cost": {"dataType":"string","required":true},
            "payment_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]}],"required":true},
            "kind": {"dataType":"string","required":true},
            "collateral": {"dataType":"string"},
            "contractor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaymentTypes": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["one-time"]},{"dataType":"enum","enums":["hourly"]},{"dataType":"enum","enums":["daily"]},{"dataType":"enum","enums":["unit"]},{"dataType":"enum","enums":["box"]},{"dataType":"enum","enums":["scu"]},{"dataType":"enum","enums":["cscu"]},{"dataType":"enum","enums":["mscu"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "departure": {"dataType":"string","required":true},
            "destination": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "cost": {"dataType":"string","required":true},
            "payment_type": {"ref":"PaymentTypes","required":true},
            "collateral": {"dataType":"string","required":true},
            "customer_id": {"dataType":"string","required":true},
            "timestamp": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "expiration": {"dataType":"string","required":true},
            "customer": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorRole": {
        "dataType": "refObject",
        "properties": {
            "role_id": {"dataType":"string","required":true},
            "contractor_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "position": {"dataType":"double","required":true},
            "manage_roles": {"dataType":"boolean","required":true},
            "manage_orders": {"dataType":"boolean","required":true},
            "kick_members": {"dataType":"boolean","required":true},
            "manage_invites": {"dataType":"boolean","required":true},
            "manage_org_details": {"dataType":"boolean","required":true},
            "manage_stock": {"dataType":"boolean","required":true},
            "manage_market": {"dataType":"boolean","required":true},
            "manage_webhooks": {"dataType":"boolean","required":true},
            "manage_recruiting": {"dataType":"boolean","required":true},
            "manage_blocklist": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Contractor": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"string","required":true},
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "banner": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "description": {"dataType":"string","required":true},
            "size": {"dataType":"double","required":true},
            "kind": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["contractor"]},{"dataType":"enum","enums":["independent"]}],"required":true},
            "archived": {"dataType":"boolean","required":true},
            "owner_role": {"dataType":"string","required":true},
            "default_role": {"dataType":"string","required":true},
            "locale": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "roles": {"dataType":"array","array":{"dataType":"refObject","ref":"ContractorRole"}},
            "member_count": {"dataType":"double"},
            "is_member": {"dataType":"boolean"},
            "user_role": {"dataType":"string"},
            "language_codes": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorsListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"contractors":{"dataType":"array","array":{"dataType":"refObject","ref":"Contractor"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorSearchResult": {
        "dataType": "refObject",
        "properties": {
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"ContractorSearchResult"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ContractorResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Contractor","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LinkContractorPayload": {
        "dataType": "refObject",
        "properties": {
            "contractor": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SuccessResponseType": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateContractorPayload": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "identifier": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "logo": {"dataType":"string"},
            "banner": {"dataType":"string"},
            "language_codes": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateContractorPayload": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "description": {"dataType":"string"},
            "language_codes": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Commodity": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"double","required":true},
            "id_parent": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "name": {"dataType":"string","required":true},
            "code": {"dataType":"string","required":true},
            "slug": {"dataType":"string","required":true},
            "kind": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "weight_scu": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "price_buy": {"dataType":"double","required":true},
            "price_sell": {"dataType":"double","required":true},
            "is_available": {"dataType":"double","required":true},
            "is_available_live": {"dataType":"double","required":true},
            "is_visible": {"dataType":"double","required":true},
            "is_extractable": {"dataType":"double","required":true},
            "is_mineral": {"dataType":"double","required":true},
            "is_raw": {"dataType":"double","required":true},
            "is_pure": {"dataType":"double","required":true},
            "is_refined": {"dataType":"double","required":true},
            "is_refinable": {"dataType":"double","required":true},
            "is_harvestable": {"dataType":"double","required":true},
            "is_buyable": {"dataType":"double","required":true},
            "is_sellable": {"dataType":"double","required":true},
            "is_temporary": {"dataType":"double","required":true},
            "is_illegal": {"dataType":"double","required":true},
            "is_volatile_qt": {"dataType":"double","required":true},
            "is_volatile_time": {"dataType":"double","required":true},
            "is_inert": {"dataType":"double","required":true},
            "is_explosive": {"dataType":"double","required":true},
            "is_buggy": {"dataType":"double","required":true},
            "is_fuel": {"dataType":"double","required":true},
            "wiki": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "date_added": {"dataType":"double","required":true},
            "date_modified": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CommoditiesResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"Commodity"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Comment": {
        "dataType": "refObject",
        "properties": {
            "comment_id": {"dataType":"string","required":true},
            "author": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "content": {"dataType":"string","required":true},
            "timestamp": {"dataType":"datetime","required":true},
            "replies": {"dataType":"array","array":{"dataType":"refObject","ref":"Comment"},"required":true},
            "upvotes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"double"}]},
            "downvotes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"double"}]},
            "reply_to": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "created_at": {"dataType":"string"},
            "updated_at": {"dataType":"string"},
            "deleted": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CommentResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Comment","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CommentReplyPayload": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CommentUpdatePayload": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatParticipant": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "username": {"dataType":"string"},
            "name": {"dataType":"string"},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "spectrum_id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Message": {
        "dataType": "refObject",
        "properties": {
            "author": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "content": {"dataType":"string","required":true},
            "timestamp": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Chat": {
        "dataType": "refObject",
        "properties": {
            "chat_id": {"dataType":"string","required":true},
            "participants": {"dataType":"array","array":{"dataType":"refObject","ref":"ChatParticipant"},"required":true},
            "messages": {"dataType":"array","array":{"dataType":"refObject","ref":"Message"},"required":true},
            "order_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "session_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "title": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatsListResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"Chat"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"Chat","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChatSuccessResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"result":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SendMessagePayload": {
        "dataType": "refObject",
        "properties": {
            "content": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateChatPayload": {
        "dataType": "refObject",
        "properties": {
            "users": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttributeDefinition": {
        "dataType": "refObject",
        "properties": {
            "attribute_name": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "attribute_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["select"]},{"dataType":"enum","enums":["multiselect"]},{"dataType":"enum","enums":["range"]},{"dataType":"enum","enums":["text"]}],"required":true},
            "allowed_values": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}],"required":true},
            "applicable_item_types": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}],"required":true},
            "display_order": {"dataType":"double","required":true},
            "show_in_filters": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttributeDefinitionsResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"definitions":{"dataType":"array","array":{"dataType":"refObject","ref":"AttributeDefinition"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttributeValueSearchResult": {
        "dataType": "refObject",
        "properties": {
            "value": {"dataType":"string","required":true},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttributeValueSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"values":{"dataType":"array","array":{"dataType":"refObject","ref":"AttributeValueSearchResult"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AttributeDefinitionResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"definition":{"ref":"AttributeDefinition","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateAttributeDefinitionPayload": {
        "dataType": "refObject",
        "properties": {
            "attribute_name": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "attribute_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["select"]},{"dataType":"enum","enums":["multiselect"]},{"dataType":"enum","enums":["range"]},{"dataType":"enum","enums":["text"]}],"required":true},
            "allowed_values": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}]},
            "applicable_item_types": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}]},
            "display_order": {"dataType":"double"},
            "show_in_filters": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateAttributeDefinitionPayload": {
        "dataType": "refObject",
        "properties": {
            "display_name": {"dataType":"string"},
            "attribute_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["select"]},{"dataType":"enum","enums":["multiselect"]},{"dataType":"enum","enums":["range"]},{"dataType":"enum","enums":["text"]}]},
            "allowed_values": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}]},
            "applicable_item_types": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}]},
            "display_order": {"dataType":"double"},
            "show_in_filters": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeleteAttributeDefinitionResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"cascade":{"dataType":"boolean","required":true},"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemAttribute": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "attribute_name": {"dataType":"string","required":true},
            "attribute_value": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemAttributeResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"attribute":{"ref":"GameItemAttribute","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpsertGameItemAttributePayload": {
        "dataType": "refObject",
        "properties": {
            "attribute_name": {"dataType":"string","required":true},
            "attribute_value": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeleteGameItemAttributeResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"message":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActivityData": {
        "dataType": "refObject",
        "properties": {
            "date": {"dataType":"string","required":true},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActivityResponse": {
        "dataType": "refObject",
        "properties": {
            "daily": {"dataType":"array","array":{"dataType":"refObject","ref":"ActivityData"},"required":true},
            "weekly": {"dataType":"array","array":{"dataType":"refObject","ref":"ActivityData"},"required":true},
            "monthly": {"dataType":"array","array":{"dataType":"refObject","ref":"ActivityData"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderAnalyticsTimeSeries": {
        "dataType": "refObject",
        "properties": {
            "date": {"dataType":"string","required":true},
            "total": {"dataType":"double","required":true},
            "in_progress": {"dataType":"double","required":true},
            "fulfilled": {"dataType":"double","required":true},
            "cancelled": {"dataType":"double","required":true},
            "not_started": {"dataType":"double","required":true},
            "average_fulfilled_value": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderAnalyticsTopContractor": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "fulfilled_orders": {"dataType":"double","required":true},
            "total_orders": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderAnalyticsTopUser": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "fulfilled_orders": {"dataType":"double","required":true},
            "total_orders": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderAnalyticsSummary": {
        "dataType": "refObject",
        "properties": {
            "total_orders": {"dataType":"double","required":true},
            "active_orders": {"dataType":"double","required":true},
            "completed_orders": {"dataType":"double","required":true},
            "total_value": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderAnalyticsResponse": {
        "dataType": "refObject",
        "properties": {
            "daily_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderAnalyticsTimeSeries"},"required":true},
            "weekly_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderAnalyticsTimeSeries"},"required":true},
            "monthly_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderAnalyticsTimeSeries"},"required":true},
            "top_contractors": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderAnalyticsTopContractor"},"required":true},
            "top_users": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderAnalyticsTopUser"},"required":true},
            "summary": {"ref":"OrderAnalyticsSummary","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DBUser": {
        "dataType": "refObject",
        "properties": {
            "discord_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "user_id": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "profile_description": {"dataType":"string","required":true},
            "role": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["admin"]}],"required":true},
            "banned": {"dataType":"boolean","required":true},
            "verified": {"dataType":"boolean","required":true},
            "username": {"dataType":"string","required":true},
            "avatar": {"dataType":"string","required":true},
            "banner": {"dataType":"string","required":true},
            "balance": {"dataType":"string","required":true},
            "created_at": {"dataType":"datetime","required":true},
            "locale": {"dataType":"string","required":true},
            "rsi_confirmed": {"dataType":"boolean","required":true},
            "spectrum_user_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "discord_access_token": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_refresh_token": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "official_server_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "discord_thread_channel_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "market_order_template": {"dataType":"string","required":true},
            "donor_start_date": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"enum","enums":[null]}]},
            "supported_languages": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UsersPaginationInfo": {
        "dataType": "refObject",
        "properties": {
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
            "total_users": {"dataType":"double","required":true},
            "total_pages": {"dataType":"double","required":true},
            "has_next": {"dataType":"boolean","required":true},
            "has_prev": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UsersResponse": {
        "dataType": "refObject",
        "properties": {
            "users": {"dataType":"array","array":{"dataType":"refObject","ref":"DBUser"},"required":true},
            "pagination": {"ref":"UsersPaginationInfo","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MembershipAnalyticsTimeSeries": {
        "dataType": "refObject",
        "properties": {
            "date": {"dataType":"string","required":true},
            "new_members": {"dataType":"double","required":true},
            "new_members_rsi_verified": {"dataType":"double","required":true},
            "new_members_rsi_unverified": {"dataType":"double","required":true},
            "cumulative_members": {"dataType":"double","required":true},
            "cumulative_members_rsi_verified": {"dataType":"double","required":true},
            "cumulative_members_rsi_unverified": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MembershipAnalyticsSummary": {
        "dataType": "refObject",
        "properties": {
            "total_members": {"dataType":"double","required":true},
            "admin_members": {"dataType":"double","required":true},
            "regular_members": {"dataType":"double","required":true},
            "rsi_confirmed_members": {"dataType":"double","required":true},
            "banned_members": {"dataType":"double","required":true},
            "new_members_30d": {"dataType":"double","required":true},
            "new_members_7d": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MembershipAnalyticsResponse": {
        "dataType": "refObject",
        "properties": {
            "daily_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"MembershipAnalyticsTimeSeries"},"required":true},
            "weekly_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"MembershipAnalyticsTimeSeries"},"required":true},
            "monthly_totals": {"dataType":"array","array":{"dataType":"refObject","ref":"MembershipAnalyticsTimeSeries"},"required":true},
            "summary": {"ref":"MembershipAnalyticsSummary","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.unknown_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuditLogEntry": {
        "dataType": "refObject",
        "properties": {
            "audit_log_id": {"dataType":"string","required":true},
            "action": {"dataType":"string","required":true},
            "actor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "actor": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "subject_type": {"dataType":"string","required":true},
            "subject_id": {"dataType":"string","required":true},
            "metadata": {"ref":"Record_string.unknown_","required":true},
            "created_at": {"dataType":"string","required":true},
            "contractor": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"spectrum_id":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"contractor_id":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuditLogsResponse": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"AuditLogEntry"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UnlinkAccountResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TestNotificationResponse": {
        "dataType": "refObject",
        "properties": {
            "message": {"dataType":"string","required":true},
            "data": {"ref":"Record_string.unknown_"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["order_create"]},{"dataType":"enum","enums":["order_assigned"]},{"dataType":"enum","enums":["order_message"]},{"dataType":"enum","enums":["order_comment"]},{"dataType":"enum","enums":["order_review"]},{"dataType":"enum","enums":["order_status_fulfilled"]},{"dataType":"enum","enums":["order_status_in_progress"]},{"dataType":"enum","enums":["order_status_not_started"]},{"dataType":"enum","enums":["order_status_cancelled"]},{"dataType":"enum","enums":["offer_create"]},{"dataType":"enum","enums":["counter_offer_create"]},{"dataType":"enum","enums":["offer_message"]},{"dataType":"enum","enums":["market_item_bid"]},{"dataType":"enum","enums":["market_item_offer"]},{"dataType":"enum","enums":["contractor_invite"]},{"dataType":"enum","enums":["admin_alert"]},{"dataType":"enum","enums":["order_review_revision_requested"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TestNotificationRequest": {
        "dataType": "refObject",
        "properties": {
            "notification_type": {"ref":"NotificationType","required":true},
            "target_username": {"dataType":"string","required":true},
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router,opts?:{multer?:ReturnType<typeof multer>}) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################

    const upload = opts?.multer ||  multer({"limits":{"fileSize":8388608}});

    
        const argsWikiController_searchWikiImages: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"path","name":"query","required":true,"dataType":"string"},
        };
        app.get('/api/v1/wiki/imagesearch/:query',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.searchWikiImages)),

            async function WikiController_searchWikiImages(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_searchWikiImages, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WikiController>(WikiController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchWikiImages',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWikiController_searchWikiItems: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"path","name":"query","required":true,"dataType":"string"},
        };
        app.get('/api/v1/wiki/itemsearch/:query',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.searchWikiItems)),

            async function WikiController_searchWikiItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_searchWikiItems, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<WikiController>(WikiController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchWikiItems',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsUploadController_uploadPhoto: Record<string, TsoaRoute.ParameterSchema> = {
                file: {"in":"formData","name":"file","required":true,"dataType":"file"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/upload/photo',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            upload.fields([
                {
                    name: "file",
                    maxCount: 1
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(UploadController)),
            ...(fetchMiddlewares<RequestHandler>(UploadController.prototype.uploadPhoto)),

            async function UploadController_uploadPhoto(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsUploadController_uploadPhoto, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<UploadController>(UploadController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'uploadPhoto',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_createToken: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateTokenPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/tokens',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.createToken)),

            async function TokensController_createToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_createToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_listTokens: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/tokens',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.listTokens)),

            async function TokensController_listTokens(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_listTokens, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listTokens',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_getToken: Record<string, TsoaRoute.ParameterSchema> = {
                tokenId: {"in":"path","name":"tokenId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/tokens/:tokenId',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.getToken)),

            async function TokensController_getToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_getToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_updateToken: Record<string, TsoaRoute.ParameterSchema> = {
                tokenId: {"in":"path","name":"tokenId","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateTokenPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/tokens/:tokenId',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.updateToken)),

            async function TokensController_updateToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_updateToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_revokeToken: Record<string, TsoaRoute.ParameterSchema> = {
                tokenId: {"in":"path","name":"tokenId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/tokens/:tokenId',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.revokeToken)),

            async function TokensController_revokeToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_revokeToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'revokeToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_extendToken: Record<string, TsoaRoute.ParameterSchema> = {
                tokenId: {"in":"path","name":"tokenId","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"ExtendTokenPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/tokens/:tokenId/extend',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.extendToken)),

            async function TokensController_extendToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_extendToken, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'extendToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_getTokenStats: Record<string, TsoaRoute.ParameterSchema> = {
                tokenId: {"in":"path","name":"tokenId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/tokens/:tokenId/stats',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.getTokenStats)),

            async function TokensController_getTokenStats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_getTokenStats, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getTokenStats',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTokensController_getAvailableScopes: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/tokens/scopes',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(TokensController)),
            ...(fetchMiddlewares<RequestHandler>(TokensController.prototype.getAvailableScopes)),

            async function TokensController_getAvailableScopes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTokensController_getAvailableScopes, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<TokensController>(TokensController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAvailableScopes',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsStarmapController_getRoute: Record<string, TsoaRoute.ParameterSchema> = {
                from: {"in":"path","name":"from","required":true,"dataType":"string"},
                to: {"in":"path","name":"to","required":true,"dataType":"string"},
                ship_size: {"in":"query","name":"ship_size","dataType":"string"},
        };
        app.get('/api/v1/starmap/route/:from/:to',
            ...(fetchMiddlewares<RequestHandler>(StarmapController)),
            ...(fetchMiddlewares<RequestHandler>(StarmapController.prototype.getRoute)),

            async function StarmapController_getRoute(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStarmapController_getRoute, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<StarmapController>(StarmapController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getRoute',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsStarmapController_getObject: Record<string, TsoaRoute.ParameterSchema> = {
                identifier: {"in":"path","name":"identifier","required":true,"dataType":"string"},
        };
        app.get('/api/v1/starmap/route/:identifier',
            ...(fetchMiddlewares<RequestHandler>(StarmapController)),
            ...(fetchMiddlewares<RequestHandler>(StarmapController.prototype.getObject)),

            async function StarmapController_getObject(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStarmapController_getObject, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<StarmapController>(StarmapController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getObject',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsStarmapController_search: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"path","name":"query","required":true,"dataType":"string"},
        };
        app.get('/api/v1/starmap/search/:query',
            ...(fetchMiddlewares<RequestHandler>(StarmapController)),
            ...(fetchMiddlewares<RequestHandler>(StarmapController.prototype.search)),

            async function StarmapController_search(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStarmapController_search, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<StarmapController>(StarmapController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'search',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopsController_getShops: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/shops',
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.getShops)),

            async function ShopsController_getShops(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_getShops, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShopsController>(ShopsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getShops',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopsController_getShop: Record<string, TsoaRoute.ParameterSchema> = {
                slug: {"in":"path","name":"slug","required":true,"dataType":"string"},
        };
        app.get('/api/v1/shops/:slug',
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.getShop)),

            async function ShopsController_getShop(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_getShop, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShopsController>(ShopsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getShop',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopsController_createShop: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateShopRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/shops',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["shops:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.createShop)),

            async function ShopsController_createShop(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_createShop, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShopsController>(ShopsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createShop',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopsController_updateShop: Record<string, TsoaRoute.ParameterSchema> = {
                slug: {"in":"path","name":"slug","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateShopRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/shops/:slug',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["shops:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.updateShop)),

            async function ShopsController_updateShop(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_updateShop, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ShopsController>(ShopsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateShop',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_createService: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateServiceRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/services',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["services:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.createService)),

            async function ServicesController_createService(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_createService, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createService',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_getUserServices: Record<string, TsoaRoute.ParameterSchema> = {
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/services/user/:username',
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.getUserServices)),

            async function ServicesController_getUserServices(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_getUserServices, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getUserServices',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_getPublicServices: Record<string, TsoaRoute.ParameterSchema> = {
                page: {"in":"query","name":"page","dataType":"double"},
                pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                search: {"in":"query","name":"search","dataType":"string"},
                kind: {"in":"query","name":"kind","dataType":"string"},
                minCost: {"in":"query","name":"minCost","dataType":"double"},
                maxCost: {"in":"query","name":"maxCost","dataType":"double"},
                paymentType: {"in":"query","name":"paymentType","dataType":"string"},
                sortBy: {"in":"query","name":"sortBy","dataType":"union","subSchemas":[{"dataType":"enum","enums":["timestamp"]},{"dataType":"enum","enums":["cost"]},{"dataType":"enum","enums":["service_name"]}]},
                sortOrder: {"in":"query","name":"sortOrder","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                language_codes: {"in":"query","name":"language_codes","dataType":"string"},
                contractor: {"in":"query","name":"contractor","dataType":"string"},
                user: {"in":"query","name":"user","dataType":"string"},
        };
        app.get('/api/v1/services/public',
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.getPublicServices)),

            async function ServicesController_getPublicServices(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_getPublicServices, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPublicServices',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_getContractorServices: Record<string, TsoaRoute.ParameterSchema> = {
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/services/contractor/:spectrum_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["services:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.getContractorServices)),

            async function ServicesController_getContractorServices(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_getContractorServices, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContractorServices',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_updateService: Record<string, TsoaRoute.ParameterSchema> = {
                service_id: {"in":"path","name":"service_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateServiceRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/services/:service_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["services:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.updateService)),

            async function ServicesController_updateService(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_updateService, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateService',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_getService: Record<string, TsoaRoute.ParameterSchema> = {
                service_id: {"in":"path","name":"service_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/services/:service_id',
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.getService)),

            async function ServicesController_getService(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_getService, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getService',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_uploadServicePhotos: Record<string, TsoaRoute.ParameterSchema> = {
                service_id: {"in":"path","name":"service_id","required":true,"dataType":"string"},
                photos: {"in":"formData","name":"photos","required":true,"dataType":"array","array":{"dataType":"file"}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/services/:service_id/photos',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["services:write"]}]),
            upload.fields([
                {
                    name: "photos",
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.uploadServicePhotos)),

            async function ServicesController_uploadServicePhotos(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_uploadServicePhotos, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'uploadServicePhotos',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_trackServiceView: Record<string, TsoaRoute.ParameterSchema> = {
                service_id: {"in":"path","name":"service_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/services/:service_id/view',
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.trackServiceView)),

            async function ServicesController_trackServiceView(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_trackServiceView, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'trackServiceView',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsServicesController_getSellerAnalytics: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                period: {"in":"query","name":"period","dataType":"string"},
        };
        app.get('/api/v1/services/seller/analytics',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["services:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ServicesController)),
            ...(fetchMiddlewares<RequestHandler>(ServicesController.prototype.getSellerAnalytics)),

            async function ServicesController_getSellerAnalytics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsServicesController_getSellerAnalytics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ServicesController>(ServicesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSellerAnalytics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_getPosts: Record<string, TsoaRoute.ParameterSchema> = {
                index: {"in":"query","name":"index","dataType":"double"},
                sorting: {"in":"query","name":"sorting","dataType":"string"},
                query: {"in":"query","name":"query","dataType":"string"},
                fields: {"in":"query","name":"fields","dataType":"string"},
                rating: {"in":"query","name":"rating","dataType":"double"},
                pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                language_codes: {"in":"query","name":"language_codes","dataType":"string"},
        };
        app.get('/api/v1/recruiting/posts',
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.getPosts)),

            async function RecruitingController_getPosts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_getPosts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPosts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_createPost: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateRecruitingPostPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/recruiting/posts',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.createPost)),

            async function RecruitingController_createPost(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_createPost, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createPost',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_getPostById: Record<string, TsoaRoute.ParameterSchema> = {
                post_id: {"in":"path","name":"post_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/recruiting/posts/:post_id',
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.getPostById)),

            async function RecruitingController_getPostById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_getPostById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPostById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_getPostComments: Record<string, TsoaRoute.ParameterSchema> = {
                post_id: {"in":"path","name":"post_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/recruiting/posts/:post_id/comments',
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.getPostComments)),

            async function RecruitingController_getPostComments(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_getPostComments, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPostComments',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_updatePost: Record<string, TsoaRoute.ParameterSchema> = {
                post_id: {"in":"path","name":"post_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateRecruitingPostPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/recruiting/posts/:post_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.updatePost)),

            async function RecruitingController_updatePost(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_updatePost, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updatePost',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_upvotePost: Record<string, TsoaRoute.ParameterSchema> = {
                post_id: {"in":"path","name":"post_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/recruiting/posts/:post_id/upvote',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.upvotePost)),

            async function RecruitingController_upvotePost(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_upvotePost, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'upvotePost',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_commentOnPost: Record<string, TsoaRoute.ParameterSchema> = {
                post_id: {"in":"path","name":"post_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateCommentPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/recruiting/posts/:post_id/comment',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.commentOnPost)),

            async function RecruitingController_commentOnPost(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_commentOnPost, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'commentOnPost',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsRecruitingController_getPostByContractor: Record<string, TsoaRoute.ParameterSchema> = {
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/recruiting/contractors/:spectrum_id/posts',
            ...(fetchMiddlewares<RequestHandler>(RecruitingController)),
            ...(fetchMiddlewares<RequestHandler>(RecruitingController.prototype.getPostByContractor)),

            async function RecruitingController_getPostByContractor(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecruitingController_getPostByContractor, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<RecruitingController>(RecruitingController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPostByContractor',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPushController_subscribe: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"PushSubscriptionPayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.post('/api/v1/push/subscribe',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PushController)),
            ...(fetchMiddlewares<RequestHandler>(PushController.prototype.subscribe)),

            async function PushController_subscribe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPushController_subscribe, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PushController>(PushController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'subscribe',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPushController_getSubscriptions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/push/subscribe',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PushController)),
            ...(fetchMiddlewares<RequestHandler>(PushController.prototype.getSubscriptions)),

            async function PushController_getSubscriptions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPushController_getSubscriptions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PushController>(PushController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSubscriptions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPushController_unsubscribe: Record<string, TsoaRoute.ParameterSchema> = {
                subscription_id: {"in":"path","name":"subscription_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.delete('/api/v1/push/subscribe/:subscription_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PushController)),
            ...(fetchMiddlewares<RequestHandler>(PushController.prototype.unsubscribe)),

            async function PushController_unsubscribe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPushController_unsubscribe, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PushController>(PushController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'unsubscribe',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPushController_getPreferences: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/push/preferences',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PushController)),
            ...(fetchMiddlewares<RequestHandler>(PushController.prototype.getPreferences)),

            async function PushController_getPreferences(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPushController_getPreferences, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PushController>(PushController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getPreferences',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPushController_updatePreferences: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdatePushPreferencePayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.patch('/api/v1/push/preferences',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PushController)),
            ...(fetchMiddlewares<RequestHandler>(PushController.prototype.updatePreferences)),

            async function PushController_updatePreferences(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPushController_updatePreferences, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PushController>(PushController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updatePreferences',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPrometheusController_query: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"query","name":"query","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/prometheus/query',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin:stats","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController)),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController.prototype.query)),

            async function PrometheusController_query(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPrometheusController_query, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PrometheusController>(PrometheusController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'query',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPrometheusController_queryRangeGet: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"query","name":"query","required":true,"dataType":"string"},
                start: {"in":"query","name":"start","required":true,"dataType":"string"},
                end: {"in":"query","name":"end","required":true,"dataType":"string"},
                step: {"in":"query","name":"step","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/prometheus/query_range',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin:stats","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController)),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController.prototype.queryRangeGet)),

            async function PrometheusController_queryRangeGet(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPrometheusController_queryRangeGet, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PrometheusController>(PrometheusController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'queryRangeGet',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPrometheusController_queryRangePost: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"step":{"dataType":"string"},"end":{"dataType":"string","required":true},"start":{"dataType":"string","required":true},"query":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/prometheus/query_range',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin:stats","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController)),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController.prototype.queryRangePost)),

            async function PrometheusController_queryRangePost(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPrometheusController_queryRangePost, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PrometheusController>(PrometheusController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'queryRangePost',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPrometheusController_getLabelValues: Record<string, TsoaRoute.ParameterSchema> = {
                label_name: {"in":"path","name":"label_name","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/prometheus/label/:label_name/values',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin:stats","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController)),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController.prototype.getLabelValues)),

            async function PrometheusController_getLabelValues(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPrometheusController_getLabelValues, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PrometheusController>(PrometheusController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getLabelValues',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPrometheusController_getSeries: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/prometheus/series',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin:stats","admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController)),
            ...(fetchMiddlewares<RequestHandler>(PrometheusController.prototype.getSeries)),

            async function PrometheusController_getSeries(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPrometheusController_getSeries, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<PrometheusController>(PrometheusController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getSeries',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getOwnProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/profile',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProfileController)),
            ...(fetchMiddlewares<RequestHandler>(ProfileController.prototype.getOwnProfile)),

            async function ProfileController_getOwnProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getOwnProfile, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProfileController>(ProfileController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOwnProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_updateProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateProfilePayload"},
        };
        app.put('/api/v1/profile',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ProfileController)),
            ...(fetchMiddlewares<RequestHandler>(ProfileController.prototype.updateProfile)),

            async function ProfileController_updateProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_updateProfile, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProfileController>(ProfileController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_getUserByUsername: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
        };
        app.get('/api/v1/profile/user/:username',
            ...(fetchMiddlewares<RequestHandler>(ProfileController)),
            ...(fetchMiddlewares<RequestHandler>(ProfileController.prototype.getUserByUsername)),

            async function ProfileController_getUserByUsername(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_getUserByUsername, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProfileController>(ProfileController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getUserByUsername',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProfileController_searchProfiles: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                query: {"in":"path","name":"query","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"string"},
        };
        app.get('/api/v1/profile/search/:query',
            ...(fetchMiddlewares<RequestHandler>(ProfileController)),
            ...(fetchMiddlewares<RequestHandler>(ProfileController.prototype.searchProfiles)),

            async function ProfileController_searchProfiles(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProfileController_searchProfiles, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ProfileController>(ProfileController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchProfiles',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_searchOrders: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                customer: {"in":"query","name":"customer","dataType":"string"},
                assigned: {"in":"query","name":"assigned","dataType":"string"},
                contractor: {"in":"query","name":"contractor","dataType":"string"},
                status: {"in":"query","name":"status","dataType":"string"},
                sort_method: {"in":"query","name":"sort_method","dataType":"string"},
                sort_order: {"in":"query","name":"sort_order","dataType":"string"},
                page: {"in":"query","name":"page","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/orders/search',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.searchOrders)),

            async function OrdersController_searchOrders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_searchOrders, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchOrders',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_getContractorMetrics: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
        };
        app.get('/api/orders/contractor/:spectrum_id/metrics',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.getContractorMetrics)),

            async function OrdersController_getContractorMetrics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_getContractorMetrics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContractorMetrics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_getContractorOrderData: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
                include_trends: {"in":"query","name":"include_trends","dataType":"boolean"},
                assigned_only: {"in":"query","name":"assigned_only","dataType":"boolean"},
        };
        app.get('/api/orders/contractor/:spectrum_id/data',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.getContractorOrderData)),

            async function OrdersController_getContractorOrderData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_getContractorOrderData, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContractorOrderData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_getUserOrderData: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/orders/user/data',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.getUserOrderData)),

            async function OrdersController_getUserOrderData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_getUserOrderData, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getUserOrderData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_getOrderById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
        };
        app.get('/api/orders/:order_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.getOrderById)),

            async function OrdersController_getOrderById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_getOrderById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOrderById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_createOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateOrderPayload"},
        };
        app.post('/api/orders',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.createOrder)),

            async function OrdersController_createOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_createOrder, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOrder',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_updateOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateOrderPayload"},
        };
        app.put('/api/orders/:order_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.updateOrder)),

            async function OrdersController_updateOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_updateOrder, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateOrder',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_applyToOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"ApplyToOrderPayload"},
        };
        app.post('/api/orders/:order_id/applicants',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.applyToOrder)),

            async function OrdersController_applyToOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_applyToOrder, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'applyToOrder',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_acceptContractorApplicant: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
        };
        app.post('/api/orders/:order_id/applicants/contractors/:spectrum_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.acceptContractorApplicant)),

            async function OrdersController_acceptContractorApplicant(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_acceptContractorApplicant, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptContractorApplicant',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_acceptUserApplicant: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
        };
        app.post('/api/orders/:order_id/applicants/users/:username',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.acceptUserApplicant)),

            async function OrdersController_acceptUserApplicant(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_acceptUserApplicant, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'acceptUserApplicant',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersController_createOrderThread: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
        };
        app.post('/api/orders/:order_id/thread',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.createOrderThread)),

            async function OrdersController_createOrderThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_createOrderThread, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OrdersController>(OrdersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOrderThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOffersController_getOfferSessions: Record<string, TsoaRoute.ParameterSchema> = {
                session_id: {"in":"path","name":"session_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/offer/:session_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["offers:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.getOfferSessions)),

            async function OffersController_getOfferSessions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_getOfferSessions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OffersController>(OffersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOfferSessions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOffersController_updateOfferSession: Record<string, TsoaRoute.ParameterSchema> = {
                session_id: {"in":"path","name":"session_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateOfferSessionRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/offer/:session_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["offers:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.updateOfferSession)),

            async function OffersController_updateOfferSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_updateOfferSession, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OffersController>(OffersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateOfferSession',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOffersController_createOfferThread: Record<string, TsoaRoute.ParameterSchema> = {
                session_id: {"in":"path","name":"session_id","required":true,"dataType":"string"},
                _body: {"in":"body","name":"_body","required":true,"ref":"CreateThreadRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/offers/:session_id/thread',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["offers:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.createOfferThread)),

            async function OffersController_createOfferThread(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_createOfferThread, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OffersController>(OffersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createOfferThread',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOffersController_searchOffers: Record<string, TsoaRoute.ParameterSchema> = {
                sort_method: {"in":"query","name":"sort_method","dataType":"union","subSchemas":[{"dataType":"enum","enums":["title"]},{"dataType":"enum","enums":["customer_name"]},{"dataType":"enum","enums":["status"]},{"dataType":"enum","enums":["timestamp"]},{"dataType":"enum","enums":["contractor_name"]}]},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["to-seller"]},{"dataType":"enum","enums":["to-customer"]},{"dataType":"enum","enums":["accepted"]},{"dataType":"enum","enums":["rejected"]}]},
                assigned: {"in":"query","name":"assigned","dataType":"string"},
                contractor: {"in":"query","name":"contractor","dataType":"string"},
                customer: {"in":"query","name":"customer","dataType":"string"},
                index: {"in":"query","name":"index","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                reverse_sort: {"in":"query","name":"reverse_sort","dataType":"boolean"},
                buyer_username: {"in":"query","name":"buyer_username","dataType":"string"},
                seller_username: {"in":"query","name":"seller_username","dataType":"string"},
                has_market_listings: {"in":"query","name":"has_market_listings","dataType":"boolean"},
                has_service: {"in":"query","name":"has_service","dataType":"boolean"},
                cost_min: {"in":"query","name":"cost_min","dataType":"double"},
                cost_max: {"in":"query","name":"cost_max","dataType":"double"},
                date_from: {"in":"query","name":"date_from","dataType":"string"},
                date_to: {"in":"query","name":"date_to","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/offers/search',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["offers:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.searchOffers)),

            async function OffersController_searchOffers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_searchOffers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OffersController>(OffersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchOffers',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOffersController_mergeOffers: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"MergeOffersRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/offers/merge',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["offers:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.mergeOffers)),

            async function OffersController_mergeOffers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_mergeOffers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<OffersController>(OffersController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'mergeOffers',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationsController_getNotifications: Record<string, TsoaRoute.ParameterSchema> = {
                page: {"in":"path","name":"page","required":true,"dataType":"double"},
                pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                action: {"in":"query","name":"action","dataType":"string"},
                entityId: {"in":"query","name":"entityId","dataType":"string"},
                scope: {"in":"query","name":"scope","dataType":"union","subSchemas":[{"dataType":"enum","enums":["individual"]},{"dataType":"enum","enums":["organization"]},{"dataType":"enum","enums":["all"]}]},
                contractorId: {"in":"query","name":"contractorId","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/notification/:page',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["notifications:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController.prototype.getNotifications)),

            async function NotificationsController_getNotifications(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationsController_getNotifications, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<NotificationsController>(NotificationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getNotifications',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationsController_updateNotification: Record<string, TsoaRoute.ParameterSchema> = {
                notification_id: {"in":"path","name":"notification_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateNotificationPayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.patch('/api/v1/notification/:notification_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["notifications:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController.prototype.updateNotification)),

            async function NotificationsController_updateNotification(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationsController_updateNotification, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<NotificationsController>(NotificationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateNotification',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationsController_bulkUpdateNotifications: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateNotificationPayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.patch('/api/v1/notification',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["notifications:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController.prototype.bulkUpdateNotifications)),

            async function NotificationsController_bulkUpdateNotifications(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationsController_bulkUpdateNotifications, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<NotificationsController>(NotificationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'bulkUpdateNotifications',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationsController_deleteNotification: Record<string, TsoaRoute.ParameterSchema> = {
                notification_id: {"in":"path","name":"notification_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.delete('/api/v1/notification/:notification_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["notifications:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController.prototype.deleteNotification)),

            async function NotificationsController_deleteNotification(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationsController_deleteNotification, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<NotificationsController>(NotificationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteNotification',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationsController_bulkDeleteNotifications: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"BulkDeleteNotificationsPayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.delete('/api/v1/notification',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["notifications:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationsController.prototype.bulkDeleteNotifications)),

            async function NotificationsController_bulkDeleteNotifications(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationsController_bulkDeleteNotifications, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<NotificationsController>(NotificationsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'bulkDeleteNotifications',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsModerationController_reportContent: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateReportPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/moderation/report',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["moderation:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ModerationController)),
            ...(fetchMiddlewares<RequestHandler>(ModerationController.prototype.reportContent)),

            async function ModerationController_reportContent(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsModerationController_reportContent, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ModerationController>(ModerationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'reportContent',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsModerationController_getUserReports: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/moderation/reports',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["moderation:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ModerationController)),
            ...(fetchMiddlewares<RequestHandler>(ModerationController.prototype.getUserReports)),

            async function ModerationController_getUserReports(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsModerationController_getUserReports, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ModerationController>(ModerationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getUserReports',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsModerationController_getAdminReports: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                status: {"in":"query","name":"status","ref":"ReportStatus"},
                reporter_id: {"in":"query","name":"reporter_id","dataType":"string"},
        };
        app.get('/api/moderation/admin/reports',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin","moderation:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ModerationController)),
            ...(fetchMiddlewares<RequestHandler>(ModerationController.prototype.getAdminReports)),

            async function ModerationController_getAdminReports(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsModerationController_getAdminReports, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ModerationController>(ModerationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAdminReports',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsModerationController_updateReportStatus: Record<string, TsoaRoute.ParameterSchema> = {
                report_id: {"in":"path","name":"report_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateReportPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/moderation/admin/reports/:report_id',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin","moderation:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ModerationController)),
            ...(fetchMiddlewares<RequestHandler>(ModerationController.prototype.updateReportStatus)),

            async function ModerationController_updateReportStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsModerationController_updateReportStatus, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ModerationController>(ModerationController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateReportStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_searchListings: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                item_type: {"in":"query","name":"item_type","dataType":"string"},
                status: {"in":"query","name":"status","dataType":"string"},
                min_price: {"in":"query","name":"min_price","dataType":"string"},
                max_price: {"in":"query","name":"max_price","dataType":"string"},
                page: {"in":"query","name":"page","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"string"},
        };
        app.get('/api/v1/market/listings',
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.searchListings)),

            async function MarketListingsController_searchListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_searchListings, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchListings',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_getListingDetails: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/market/listings/:listing_id',
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.getListingDetails)),

            async function MarketListingsController_getListingDetails(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_getListingDetails, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getListingDetails',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_createListing: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateMarketListingPayload"},
        };
        app.post('/api/v1/market/listings',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.createListing)),

            async function MarketListingsController_createListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_createListing, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createListing',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_updateListing: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateMarketListingPayload"},
        };
        app.put('/api/v1/market/listing/:listing_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.updateListing)),

            async function MarketListingsController_updateListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_updateListing, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateListing',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_getListingStats: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"listing_ids":{"dataType":"array","array":{"dataType":"string"},"required":true}}},
        };
        app.post('/api/v1/market/listings/stats',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.getListingStats)),

            async function MarketListingsController_getListingStats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_getListingStats, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getListingStats',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_updateQuantity: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateQuantityPayload"},
        };
        app.post('/api/v1/market/listing/:listing_id/update_quantity',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.updateQuantity)),

            async function MarketListingsController_updateQuantity(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_updateQuantity, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateQuantity',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_refreshListing: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.post('/api/v1/market/listing/:listing_id/refresh',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.refreshListing)),

            async function MarketListingsController_refreshListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_refreshListing, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'refreshListing',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketListingsController_trackView: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.post('/api/v1/market/listings/:listing_id/views',
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController)),
            ...(fetchMiddlewares<RequestHandler>(MarketListingsController.prototype.trackView)),

            async function MarketListingsController_trackView(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketListingsController_trackView, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<MarketListingsController>(MarketListingsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'trackView',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsHealthController_getHealth: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/health',
            ...(fetchMiddlewares<RequestHandler>(HealthController)),
            ...(fetchMiddlewares<RequestHandler>(HealthController.prototype.getHealth)),

            async function HealthController_getHealth(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHealthController_getHealth, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<HealthController>(HealthController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getHealth',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEmailController_getNotificationTypes: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/email/notification-types',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(EmailController)),
            ...(fetchMiddlewares<RequestHandler>(EmailController.prototype.getNotificationTypes)),

            async function EmailController_getNotificationTypes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEmailController_getNotificationTypes, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EmailController>(EmailController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getNotificationTypes',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEmailController_getEmailPreferences: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/email/preferences',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(EmailController)),
            ...(fetchMiddlewares<RequestHandler>(EmailController.prototype.getEmailPreferences)),

            async function EmailController_getEmailPreferences(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEmailController_getEmailPreferences, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EmailController>(EmailController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getEmailPreferences',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEmailController_updateEmailPreferences: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateEmailPreferencePayload"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.patch('/api/v1/email/preferences',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(EmailController)),
            ...(fetchMiddlewares<RequestHandler>(EmailController.prototype.updateEmailPreferences)),

            async function EmailController_updateEmailPreferences(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEmailController_updateEmailPreferences, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EmailController>(EmailController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateEmailPreferences',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsEmailController_unsubscribe: Record<string, TsoaRoute.ParameterSchema> = {
                token: {"in":"path","name":"token","required":true,"dataType":"string"},
                json: {"in":"query","name":"json","dataType":"boolean"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.post('/api/v1/email/unsubscribe/:token',
            ...(fetchMiddlewares<RequestHandler>(EmailController)),
            ...(fetchMiddlewares<RequestHandler>(EmailController.prototype.unsubscribe)),

            async function EmailController_unsubscribe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsEmailController_unsubscribe, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<EmailController>(EmailController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'unsubscribe',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDeliveriesController_createDelivery: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateDeliveryRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/delivery/create',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["orders:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(DeliveriesController)),
            ...(fetchMiddlewares<RequestHandler>(DeliveriesController.prototype.createDelivery)),

            async function DeliveriesController_createDelivery(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDeliveriesController_createDelivery, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DeliveriesController>(DeliveriesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDelivery',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDeliveriesController_getMyDeliveries: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/deliveries/mine',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["orders:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(DeliveriesController)),
            ...(fetchMiddlewares<RequestHandler>(DeliveriesController.prototype.getMyDeliveries)),

            async function DeliveriesController_getMyDeliveries(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDeliveriesController_getMyDeliveries, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<DeliveriesController>(DeliveriesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getMyDeliveries',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractsController_createContract: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateContractRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/contracts',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["orders:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractsController.prototype.createContract)),

            async function ContractsController_createContract(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractsController_createContract, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractsController>(ContractsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createContract',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractsController_createContractOffer: Record<string, TsoaRoute.ParameterSchema> = {
                contract_id: {"in":"path","name":"contract_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateContractOfferRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/contracts/:contract_id/offers',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":["orders:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractsController.prototype.createContractOffer)),

            async function ContractsController_createContractOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractsController_createContractOffer, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractsController>(ContractsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createContractOffer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractsController_getContract: Record<string, TsoaRoute.ParameterSchema> = {
                contract_id: {"in":"path","name":"contract_id","required":true,"dataType":"string"},
        };
        app.get('/api/v1/contracts/:contract_id',
            ...(fetchMiddlewares<RequestHandler>(ContractsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractsController.prototype.getContract)),

            async function ContractsController_getContract(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractsController_getContract, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractsController>(ContractsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContract',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractsController_listContracts: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/contracts',
            ...(fetchMiddlewares<RequestHandler>(ContractsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractsController.prototype.listContracts)),

            async function ContractsController_listContracts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractsController_listContracts, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractsController>(ContractsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'listContracts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_getContractors: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/contractors',
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.getContractors)),

            async function ContractorsController_getContractors(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_getContractors, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContractors',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_searchContractors: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"path","name":"query","required":true,"dataType":"string"},
                language_codes: {"in":"query","name":"language_codes","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/contractors/search/:query',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.searchContractors)),

            async function ContractorsController_searchContractors(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_searchContractors, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchContractors',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_getContractor: Record<string, TsoaRoute.ParameterSchema> = {
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/contractors/:spectrum_id',
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.getContractor)),

            async function ContractorsController_getContractor(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_getContractor, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getContractor',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_linkContractor: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"LinkContractorPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/contractors/auth/link',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.linkContractor)),

            async function ContractorsController_linkContractor(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_linkContractor, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'linkContractor',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_createContractor: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateContractorPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/contractors',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.createContractor)),

            async function ContractorsController_createContractor(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_createContractor, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createContractor',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsContractorsController_updateContractor: Record<string, TsoaRoute.ParameterSchema> = {
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateContractorPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/contractors/:spectrum_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController)),
            ...(fetchMiddlewares<RequestHandler>(ContractorsController.prototype.updateContractor)),

            async function ContractorsController_updateContractor(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsContractorsController_updateContractor, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ContractorsController>(ContractorsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateContractor',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommoditiesController_getCommodities: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/commodities',
            ...(fetchMiddlewares<RequestHandler>(CommoditiesController)),
            ...(fetchMiddlewares<RequestHandler>(CommoditiesController.prototype.getCommodities)),

            async function CommoditiesController_getCommodities(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommoditiesController_getCommodities, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommoditiesController>(CommoditiesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getCommodities',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommentsController_replyToComment: Record<string, TsoaRoute.ParameterSchema> = {
                comment_id: {"in":"path","name":"comment_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CommentReplyPayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/comments/:comment_id/reply',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CommentsController)),
            ...(fetchMiddlewares<RequestHandler>(CommentsController.prototype.replyToComment)),

            async function CommentsController_replyToComment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommentsController_replyToComment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommentsController>(CommentsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'replyToComment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommentsController_deleteComment: Record<string, TsoaRoute.ParameterSchema> = {
                comment_id: {"in":"path","name":"comment_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/comments/:comment_id/delete',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CommentsController)),
            ...(fetchMiddlewares<RequestHandler>(CommentsController.prototype.deleteComment)),

            async function CommentsController_deleteComment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommentsController_deleteComment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommentsController>(CommentsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteComment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommentsController_updateComment: Record<string, TsoaRoute.ParameterSchema> = {
                comment_id: {"in":"path","name":"comment_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CommentUpdatePayload"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/comments/:comment_id/update',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CommentsController)),
            ...(fetchMiddlewares<RequestHandler>(CommentsController.prototype.updateComment)),

            async function CommentsController_updateComment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommentsController_updateComment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommentsController>(CommentsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateComment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommentsController_upvoteComment: Record<string, TsoaRoute.ParameterSchema> = {
                comment_id: {"in":"path","name":"comment_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/comments/:comment_id/upvote',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CommentsController)),
            ...(fetchMiddlewares<RequestHandler>(CommentsController.prototype.upvoteComment)),

            async function CommentsController_upvoteComment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommentsController_upvoteComment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommentsController>(CommentsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'upvoteComment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCommentsController_downvoteComment: Record<string, TsoaRoute.ParameterSchema> = {
                comment_id: {"in":"path","name":"comment_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/comments/:comment_id/downvote',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CommentsController)),
            ...(fetchMiddlewares<RequestHandler>(CommentsController.prototype.downvoteComment)),

            async function CommentsController_downvoteComment(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCommentsController_downvoteComment, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<CommentsController>(CommentsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'downvoteComment',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_getChats: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/chats',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.getChats)),

            async function ChatsController_getChats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_getChats, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getChats',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_getChatById: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                chat_id: {"in":"path","name":"chat_id","required":true,"dataType":"string"},
        };
        app.get('/api/chats/:chat_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.getChatById)),

            async function ChatsController_getChatById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_getChatById, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getChatById',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_getChatByOrderId: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
        };
        app.get('/api/chats/orders/:order_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.getChatByOrderId)),

            async function ChatsController_getChatByOrderId(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_getChatByOrderId, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getChatByOrderId',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_getChatByOfferSessionId: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                session_id: {"in":"path","name":"session_id","required":true,"dataType":"string"},
        };
        app.get('/api/chats/offers/:session_id',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.getChatByOfferSessionId)),

            async function ChatsController_getChatByOfferSessionId(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_getChatByOfferSessionId, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getChatByOfferSessionId',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_sendMessage: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                chat_id: {"in":"path","name":"chat_id","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"SendMessagePayload"},
        };
        app.post('/api/chats/:chat_id/messages',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.sendMessage)),

            async function ChatsController_sendMessage(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_sendMessage, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'sendMessage',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsChatsController_createChat: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateChatPayload"},
        };
        app.post('/api/chats',
            authenticateMiddleware([{"sessionAuth":[]},{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ChatsController)),
            ...(fetchMiddlewares<RequestHandler>(ChatsController.prototype.createChat)),

            async function ChatsController_createChat(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsChatsController_createChat, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<ChatsController>(ChatsController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createChat',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_getDefinitions: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                applicable_item_types: {"in":"query","name":"applicable_item_types","dataType":"string"},
                include_hidden: {"in":"query","name":"include_hidden","dataType":"string"},
        };
        app.get('/api/v1/attributes/definitions',
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.getDefinitions)),

            async function AttributesController_getDefinitions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_getDefinitions, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getDefinitions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_searchAttributeValues: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                attribute_name: {"in":"query","name":"attribute_name","required":true,"dataType":"string"},
                q: {"in":"query","name":"q","dataType":"string"},
                item_type: {"in":"query","name":"item_type","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"string"},
        };
        app.get('/api/v1/attributes/values/search',
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.searchAttributeValues)),

            async function AttributesController_searchAttributeValues(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_searchAttributeValues, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'searchAttributeValues',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_createDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                payload: {"in":"body","name":"payload","required":true,"ref":"CreateAttributeDefinitionPayload"},
        };
        app.post('/api/v1/attributes/definitions',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.createDefinition)),

            async function AttributesController_createDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_createDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'createDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_updateDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                attribute_name: {"in":"path","name":"attribute_name","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpdateAttributeDefinitionPayload"},
        };
        app.put('/api/v1/attributes/definitions/:attribute_name',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.updateDefinition)),

            async function AttributesController_updateDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_updateDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'updateDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_deleteDefinition: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                attribute_name: {"in":"path","name":"attribute_name","required":true,"dataType":"string"},
                cascade: {"in":"query","name":"cascade","dataType":"string"},
        };
        app.delete('/api/v1/attributes/definitions/:attribute_name',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.deleteDefinition)),

            async function AttributesController_deleteDefinition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_deleteDefinition, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteDefinition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_upsertGameItemAttribute: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                game_item_id: {"in":"path","name":"game_item_id","required":true,"dataType":"string"},
                attribute_name: {"in":"path","name":"attribute_name","required":true,"dataType":"string"},
                payload: {"in":"body","name":"payload","required":true,"ref":"UpsertGameItemAttributePayload"},
        };
        app.put('/api/v1/attributes/game-items/:game_item_id/attributes/:attribute_name',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.upsertGameItemAttribute)),

            async function AttributesController_upsertGameItemAttribute(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_upsertGameItemAttribute, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'upsertGameItemAttribute',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAttributesController_deleteGameItemAttribute: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                game_item_id: {"in":"path","name":"game_item_id","required":true,"dataType":"string"},
                attribute_name: {"in":"path","name":"attribute_name","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/attributes/game-items/:game_item_id/attributes/:attribute_name',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AttributesController)),
            ...(fetchMiddlewares<RequestHandler>(AttributesController.prototype.deleteGameItemAttribute)),

            async function AttributesController_deleteGameItemAttribute(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAttributesController_deleteGameItemAttribute, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AttributesController>(AttributesController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'deleteGameItemAttribute',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_getActivity: Record<string, TsoaRoute.ParameterSchema> = {
                format: {"in":"query","name":"format","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/admin/activity',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getActivity)),

            async function AdminController_getActivity(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getActivity, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getActivity',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_getOrderAnalytics: Record<string, TsoaRoute.ParameterSchema> = {
                format: {"in":"query","name":"format","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/admin/orders/analytics',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getOrderAnalytics)),

            async function AdminController_getOrderAnalytics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getOrderAnalytics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getOrderAnalytics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_getUsers: Record<string, TsoaRoute.ParameterSchema> = {
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["admin"]}]},
                banned: {"in":"query","name":"banned","dataType":"boolean"},
                rsi_confirmed: {"in":"query","name":"rsi_confirmed","dataType":"boolean"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["username"]},{"dataType":"enum","enums":["display_name"]},{"dataType":"enum","enums":["role"]},{"dataType":"enum","enums":["banned"]},{"dataType":"enum","enums":["rsi_confirmed"]},{"dataType":"enum","enums":["balance"]},{"dataType":"enum","enums":["locale"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/admin/users',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getUsers)),

            async function AdminController_getUsers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getUsers, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getUsers',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_getMembershipAnalytics: Record<string, TsoaRoute.ParameterSchema> = {
                format: {"in":"query","name":"format","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/admin/membership/analytics',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getMembershipAnalytics)),

            async function AdminController_getMembershipAnalytics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getMembershipAnalytics, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getMembershipAnalytics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_getAuditLogs: Record<string, TsoaRoute.ParameterSchema> = {
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                action: {"in":"query","name":"action","dataType":"string"},
                subject_type: {"in":"query","name":"subject_type","dataType":"string"},
                subject_id: {"in":"query","name":"subject_id","dataType":"string"},
                actor_id: {"in":"query","name":"actor_id","dataType":"string"},
                start_date: {"in":"query","name":"start_date","dataType":"string"},
                end_date: {"in":"query","name":"end_date","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v1/admin/audit-logs',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getAuditLogs)),

            async function AdminController_getAuditLogs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getAuditLogs, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'getAuditLogs',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_unlinkUserAccount: Record<string, TsoaRoute.ParameterSchema> = {
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/admin/users/:username/unlink',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.unlinkUserAccount)),

            async function AdminController_unlinkUserAccount(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_unlinkUserAccount, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'unlinkUserAccount',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAdminController_testNotification: Record<string, TsoaRoute.ParameterSchema> = {
                payload: {"in":"body","name":"payload","required":true,"ref":"TestNotificationRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/admin/notifications/test',
            authenticateMiddleware([{"sessionAuth":["admin"]},{"bearerAuth":["admin"]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.testNotification)),

            async function AdminController_testNotification(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_testNotification, request, response });

                const container: IocContainer = typeof iocContainer === 'function' ? (iocContainer as IocContainerFactory)(request) : iocContainer;

                const controller: any = await container.get<AdminController>(AdminController);
                if (typeof controller['setStatus'] === 'function') {
                controller.setStatus(undefined);
                }

              await templateService.apiHandler({
                methodName: 'testNotification',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
