/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ShopsController } from './../controllers/ShopsController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OrdersController } from './../controllers/OrdersController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OffersController } from './../controllers/OffersController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MeController } from './../controllers/MeController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ListingsController } from './../controllers/ListingsController.js';
import { expressAuthentication } from './../auth.js';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "PublicErrorCode": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["VALIDATION_ERROR"]},{"dataType":"enum","enums":["UNAUTHORIZED"]},{"dataType":"enum","enums":["INVALID_TOKEN"]},{"dataType":"enum","enums":["FORBIDDEN"]},{"dataType":"enum","enums":["INSUFFICIENT_SCOPE"]},{"dataType":"enum","enums":["ACCOUNT_BANNED"]},{"dataType":"enum","enums":["NOT_FOUND"]},{"dataType":"enum","enums":["CONFLICT"]},{"dataType":"enum","enums":["RATE_LIMIT_EXCEEDED"]},{"dataType":"enum","enums":["SERVICE_UNAVAILABLE"]},{"dataType":"enum","enums":["INTERNAL_SERVER_ERROR"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.unknown_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicValidationError": {
        "dataType": "refObject",
        "properties": {
            "field": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
            "code": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicErrorBody": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"nestedObjectLiteral","nestedProperties":{"validationErrors":{"dataType":"array","array":{"dataType":"refObject","ref":"PublicValidationError"}},"details":{"ref":"Record_string.unknown_"},"message":{"dataType":"string","required":true},"code":{"ref":"PublicErrorCode","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicShopPermissions": {
        "dataType": "refObject",
        "properties": {
            "can_manage": {"dataType":"boolean","required":true},
            "manage_market": {"dataType":"boolean","required":true},
            "manage_stock": {"dataType":"boolean","required":true},
            "manage_orders": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicShop": {
        "dataType": "refObject",
        "properties": {
            "shop_id": {"dataType":"string","required":true},
            "slug": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "owner": {"dataType":"nestedObjectLiteral","nestedProperties":{"spectrum_id":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"user_id":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["org"]}],"required":true}},"required":true},
            "supported_languages": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "accepts_custom_orders": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "permissions": {"ref":"PublicShopPermissions","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicShopList": {
        "dataType": "refObject",
        "properties": {
            "shops": {"dataType":"array","array":{"dataType":"refObject","ref":"PublicShop"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_PublicShopList_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"PublicShopList","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_PublicShop_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"PublicShop","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MyListingItem": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "variant_count": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "price_min": {"dataType":"double","required":true},
            "price_max": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "photo": {"dataType":"string"},
            "expires_at": {"dataType":"string"},
            "visibility": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["public"]},{"dataType":"enum","enums":["private"]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetMyListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "listings": {"dataType":"array","array":{"dataType":"refObject","ref":"MyListingItem"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetMyListingsResponse_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetMyListingsResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderPreview": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "buyer_username": {"dataType":"string","required":true},
            "shop_name": {"dataType":"string","required":true},
            "shop_slug": {"dataType":"string","required":true},
            "item_count": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "buyer_avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "shop_logo": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetOrdersResponse": {
        "dataType": "refObject",
        "properties": {
            "orders": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderPreview"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetOrdersResponse_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetOrdersResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderMarketListingV1": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VariantAttributes": {
        "dataType": "refObject",
        "properties": {
            "quality_tier": {"dataType":"double"},
            "quality_value": {"dataType":"double"},
            "crafted_source": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["crafted"]},{"dataType":"enum","enums":["store"]},{"dataType":"enum","enums":["looted"]},{"dataType":"enum","enums":["unknown"]},{"dataType":"enum","enums":["duped"]}]},
            "blueprint_tier": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderVariantItem": {
        "dataType": "refObject",
        "properties": {
            "order_item_id": {"dataType":"string","required":true},
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "attributes": {"ref":"VariantAttributes","required":true},
            "display_name": {"dataType":"string","required":true},
            "short_name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderMarketListingV2": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "photo": {"dataType":"string"},
            "v2_variants": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderVariantItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderVariantDetail": {
        "dataType": "refObject",
        "properties": {
            "variant_id": {"dataType":"string","required":true},
            "attributes": {"ref":"VariantAttributes","required":true},
            "display_name": {"dataType":"string","required":true},
            "short_name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderItemDetail": {
        "dataType": "refObject",
        "properties": {
            "order_item_id": {"dataType":"string","required":true},
            "listing_id": {"dataType":"string","required":true},
            "item_id": {"dataType":"string","required":true},
            "listing_title": {"dataType":"string","required":true},
            "variant": {"ref":"OrderVariantDetail","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "subtotal": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetOrderDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "buyer": {"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "seller": {"dataType":"nestedObjectLiteral","nestedProperties":{"slug":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"shop_id":{"dataType":"string","required":true}},"required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "payment_type": {"dataType":"string","required":true},
            "offer_session_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "market_listings": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderMarketListingV1"},"required":true},
            "market_listings_v2": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderMarketListingV2"},"required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderItemDetail"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetOrderDetailResponse_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetOrderDetailResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderStatusChangeResult": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["in-progress"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_OrderStatusChangeResult_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"OrderStatusChangeResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderStatusChangeBody": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["in-progress"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Rating": {
        "dataType": "refObject",
        "properties": {
            "avg_rating": {"dataType":"double","required":true},
            "rating_count": {"dataType":"double","required":true},
            "streak": {"dataType":"double","required":true},
            "total_rating": {"dataType":"double","required":true},
            "total_orders": {"dataType":"double"},
            "response_rate": {"dataType":"double"},
            "total_assignments": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BadgeMetadata": {
        "dataType": "refObject",
        "properties": {
            "avg_rating": {"dataType":"double","required":true},
            "rating_count": {"dataType":"double","required":true},
            "rating_streak": {"dataType":"double","required":true},
            "total_orders": {"dataType":"double","required":true},
            "fulfilled_orders": {"dataType":"double","required":true},
            "total_assignments": {"dataType":"double","required":true},
            "response_rate": {"dataType":"double","required":true},
            "total_rating": {"dataType":"double","required":true},
            "orders_last_30_days": {"dataType":"double","required":true},
            "orders_last_90_days": {"dataType":"double","required":true},
            "avg_completion_time_hours": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "account_age_months": {"dataType":"double","required":true},
            "account_created_at": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "donor_duration_months": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "calculated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BadgeData": {
        "dataType": "refObject",
        "properties": {
            "badge_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "metadata": {"ref":"BadgeMetadata"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MinimalUser": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "avatar": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "rating": {"ref":"Rating","required":true},
            "badges": {"dataType":"union","subSchemas":[{"ref":"BadgeData"},{"dataType":"enum","enums":[null]}]},
            "last_seen": {"dataType":"datetime"},
            "in_game": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MinimalContractor": {
        "dataType": "refObject",
        "properties": {
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"string","required":true},
            "rating": {"ref":"Rating","required":true},
            "badges": {"dataType":"union","subSchemas":[{"ref":"BadgeData"},{"dataType":"enum","enums":[null]}]},
            "last_seen": {"dataType":"datetime"},
            "members_online": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferMarketListingV1": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferVariantItem": {
        "dataType": "refObject",
        "properties": {
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "attributes": {"ref":"VariantAttributes","required":true},
            "display_name": {"dataType":"string","required":true},
            "short_name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferMarketListingV2": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "photo": {"dataType":"string"},
            "v2_variants": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferVariantItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferV2": {
        "dataType": "refObject",
        "properties": {
            "offer_id": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "cost": {"dataType":"double","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "payment_type": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "collateral": {"dataType":"double"},
            "actor_username": {"dataType":"string","required":true},
            "market_listings": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferMarketListingV1"},"required":true},
            "market_listings_v2": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferMarketListingV2"},"required":true},
            "service": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"service_id":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DBAvailabilityEntry": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "user_id": {"dataType":"string","required":true},
            "start": {"dataType":"double","required":true},
            "finish": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferAvailability": {
        "dataType": "refObject",
        "properties": {
            "customer": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"refObject","ref":"DBAvailabilityEntry"}},{"dataType":"enum","enums":[null]}],"required":true},
            "assigned": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"refObject","ref":"DBAvailabilityEntry"}},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferSessionV2": {
        "dataType": "refObject",
        "properties": {
            "session_id": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "order_id": {"dataType":"string"},
            "contract_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_thread_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_server_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_invite": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "customer": {"ref":"MinimalUser","required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"dataType":"enum","enums":[null]}],"required":true},
            "shop_slug": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferV2"},"required":true},
            "availability": {"dataType":"union","subSchemas":[{"ref":"OfferAvailability"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchOffersV2Response": {
        "dataType": "refObject",
        "properties": {
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferSessionV2"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_SearchOffersV2Response_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"SearchOffersV2Response","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetOfferSessionV2Response": {
        "dataType": "refObject",
        "properties": {
            "session_id": {"dataType":"string","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "order_id": {"dataType":"string"},
            "contract_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_thread_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_server_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "discord_invite": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "customer": {"ref":"MinimalUser","required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"dataType":"enum","enums":[null]}],"required":true},
            "shop_slug": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferV2"},"required":true},
            "availability": {"dataType":"union","subSchemas":[{"ref":"OfferAvailability"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetOfferSessionV2Response_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetOfferSessionV2Response","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferAcceptResult": {
        "dataType": "refObject",
        "properties": {
            "offer_id": {"dataType":"string","required":true},
            "order_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_OfferAcceptResult_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"OfferAcceptResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OfferDeclineResult": {
        "dataType": "refObject",
        "properties": {
            "offer_id": {"dataType":"string","required":true},
            "status": {"dataType":"enum","enums":["rejected"],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_OfferDeclineResult_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"OfferDeclineResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicScope": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["shops:read"]},{"dataType":"enum","enums":["listings:read"]},{"dataType":"enum","enums":["stock:read"]},{"dataType":"enum","enums":["orders:read"]},{"dataType":"enum","enums":["orders:write"]},{"dataType":"enum","enums":["offers:read"]},{"dataType":"enum","enums":["offers:write"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicOrgRef": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"string","required":true},
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicMe": {
        "dataType": "refObject",
        "properties": {
            "user": {"dataType":"nestedObjectLiteral","nestedProperties":{"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "token": {"dataType":"nestedObjectLiteral","nestedProperties":{"created_at":{"dataType":"string","required":true},"last_used_at":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"expires_at":{"dataType":"string","required":true},"orgs":{"dataType":"array","array":{"dataType":"refObject","ref":"PublicOrgRef"},"required":true},"scopes":{"dataType":"array","array":{"dataType":"refAlias","ref":"PublicScope"},"required":true},"preset":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_PublicMe_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"PublicMe","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingDetail": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "shop_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
            "visibility": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["public"]},{"dataType":"enum","enums":["private"]},{"dataType":"enum","enums":["unlisted"]}],"required":true},
            "sale_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["fixed"]},{"dataType":"enum","enums":["auction"]},{"dataType":"enum","enums":["negotiable"]}],"required":true},
            "listing_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["single"]},{"dataType":"enum","enums":["bundle"]},{"dataType":"enum","enums":["bulk"]}],"required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "expires_at": {"dataType":"string"},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
            "pickup_method": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["delivery"]},{"dataType":"enum","enums":["pickup"]},{"dataType":"enum","enums":["any"]},{"dataType":"enum","enums":[null]}]},
            "quantity_unit": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unit"]},{"dataType":"enum","enums":["scu"]}],"required":true},
            "min_order_quantity": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "max_order_quantity": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "min_order_value": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "max_order_value": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "view_count": {"dataType":"double"},
            "in_carts": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SellerInfo": {
        "dataType": "refObject",
        "properties": {
            "shop_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "slug": {"dataType":"string","required":true},
            "rating": {"dataType":"double","required":true},
            "logo_url": {"dataType":"string"},
            "languages": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemInfo": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "image_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VariantDetail": {
        "dataType": "refObject",
        "properties": {
            "variant_id": {"dataType":"string","required":true},
            "attributes": {"ref":"VariantAttributes","required":true},
            "display_name": {"dataType":"string","required":true},
            "short_name": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price": {"dataType":"double","required":true},
            "locations": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkDiscountTier": {
        "dataType": "refObject",
        "properties": {
            "min_quantity": {"dataType":"double","required":true},
            "discount_percent": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingItemDetail": {
        "dataType": "refObject",
        "properties": {
            "item_id": {"dataType":"string","required":true},
            "game_item": {"ref":"GameItemInfo","required":true},
            "pricing_mode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unified"]},{"dataType":"enum","enums":["per_variant"]}],"required":true},
            "base_price": {"dataType":"double"},
            "variants": {"dataType":"array","array":{"dataType":"refObject","ref":"VariantDetail"},"required":true},
            "bulk_discount_tiers": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"refObject","ref":"BulkDiscountTier"}},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetListingDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "listing": {"ref":"ListingDetail","required":true},
            "seller": {"ref":"SellerInfo","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"ListingItemDetail"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetListingDetailResponse_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetListingDetailResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLotVariant": {
        "dataType": "refObject",
        "properties": {
            "variant_id": {"dataType":"string","required":true},
            "attributes": {"ref":"VariantAttributes","required":true},
            "display_name": {"dataType":"string","required":true},
            "short_name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LocationInfo": {
        "dataType": "refObject",
        "properties": {
            "location_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "is_preset": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OwnerInfo": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
            "display_name": {"dataType":"string"},
            "avatar_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLotDetail": {
        "dataType": "refObject",
        "properties": {
            "lot_id": {"dataType":"string","required":true},
            "item_id": {"dataType":"string","required":true},
            "listing_id": {"dataType":"string","required":true},
            "listing_title": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "listing_photo": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "variant": {"ref":"StockLotVariant","required":true},
            "quantity_total": {"dataType":"double","required":true},
            "quantity_allocated": {"dataType":"double","required":true},
            "location": {"dataType":"union","subSchemas":[{"ref":"LocationInfo"},{"dataType":"enum","enums":[null]}],"required":true},
            "owner": {"dataType":"union","subSchemas":[{"ref":"OwnerInfo"},{"dataType":"enum","enums":[null]}],"required":true},
            "listed": {"dataType":"boolean","required":true},
            "notes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "crafted_by": {"dataType":"string"},
            "crafted_at": {"dataType":"string"},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetStockLotsResponse": {
        "dataType": "refObject",
        "properties": {
            "lots": {"dataType":"array","array":{"dataType":"refObject","ref":"StockLotDetail"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PublicData_GetStockLotsResponse_": {
        "dataType": "refObject",
        "properties": {
            "data": {"ref":"GetStockLotsResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
        const argsShopsController_listShops: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/shops',
            authenticateMiddleware([{"apiToken":["shops:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.listShops)),

            async function ShopsController_listShops(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_listShops, request, response });

                const controller = new ShopsController();

              await templateService.apiHandler({
                methodName: 'listShops',
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
                shop: {"in":"path","name":"shop","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/shops/:shop',
            authenticateMiddleware([{"apiToken":["shops:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.getShop)),

            async function ShopsController_getShop(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_getShop, request, response });

                const controller = new ShopsController();

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
        const argsShopsController_listShopListings: Record<string, TsoaRoute.ParameterSchema> = {
                shop: {"in":"path","name":"shop","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["inactive"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
                updated_since: {"in":"query","name":"updated_since","dataType":"datetime"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quantity"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/shops/:shop/listings',
            authenticateMiddleware([{"apiToken":["listings:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopsController)),
            ...(fetchMiddlewares<RequestHandler>(ShopsController.prototype.listShopListings)),

            async function ShopsController_listShopListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopsController_listShopListings, request, response });

                const controller = new ShopsController();

              await templateService.apiHandler({
                methodName: 'listShopListings',
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
        const argsOrdersController_listOrders: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["buyer"]},{"dataType":"enum","enums":["seller"]}]},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["not-started"]},{"dataType":"enum","enums":["in-progress"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]}]},
                shop: {"in":"query","name":"shop","dataType":"string"},
                updated_since: {"in":"query","name":"updated_since","dataType":"datetime"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["total_price"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/orders',
            authenticateMiddleware([{"apiToken":["orders:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.listOrders)),

            async function OrdersController_listOrders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_listOrders, request, response });

                const controller = new OrdersController();

              await templateService.apiHandler({
                methodName: 'listOrders',
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
        const argsOrdersController_getOrder: Record<string, TsoaRoute.ParameterSchema> = {
                orderId: {"in":"path","name":"orderId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/orders/:orderId',
            authenticateMiddleware([{"apiToken":["orders:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.getOrder)),

            async function OrdersController_getOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_getOrder, request, response });

                const controller = new OrdersController();

              await templateService.apiHandler({
                methodName: 'getOrder',
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
        const argsOrdersController_changeOrderStatus: Record<string, TsoaRoute.ParameterSchema> = {
                orderId: {"in":"path","name":"orderId","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"OrderStatusChangeBody"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/orders/:orderId/status',
            authenticateMiddleware([{"apiToken":["orders:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersController)),
            ...(fetchMiddlewares<RequestHandler>(OrdersController.prototype.changeOrderStatus)),

            async function OrdersController_changeOrderStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersController_changeOrderStatus, request, response });

                const controller = new OrdersController();

              await templateService.apiHandler({
                methodName: 'changeOrderStatus',
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
        const argsOffersController_listOffers: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["customer"]},{"dataType":"enum","enums":["seller"]}]},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["closed"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/offers',
            authenticateMiddleware([{"apiToken":["offers:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.listOffers)),

            async function OffersController_listOffers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_listOffers, request, response });

                const controller = new OffersController();

              await templateService.apiHandler({
                methodName: 'listOffers',
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
        const argsOffersController_getOffer: Record<string, TsoaRoute.ParameterSchema> = {
                offerId: {"in":"path","name":"offerId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/offers/:offerId',
            authenticateMiddleware([{"apiToken":["offers:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.getOffer)),

            async function OffersController_getOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_getOffer, request, response });

                const controller = new OffersController();

              await templateService.apiHandler({
                methodName: 'getOffer',
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
        const argsOffersController_acceptOffer: Record<string, TsoaRoute.ParameterSchema> = {
                offerId: {"in":"path","name":"offerId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/offers/:offerId/accept',
            authenticateMiddleware([{"apiToken":["offers:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.acceptOffer)),

            async function OffersController_acceptOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_acceptOffer, request, response });

                const controller = new OffersController();

              await templateService.apiHandler({
                methodName: 'acceptOffer',
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
        const argsOffersController_declineOffer: Record<string, TsoaRoute.ParameterSchema> = {
                offerId: {"in":"path","name":"offerId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/offers/:offerId/decline',
            authenticateMiddleware([{"apiToken":["offers:write"]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersController)),
            ...(fetchMiddlewares<RequestHandler>(OffersController.prototype.declineOffer)),

            async function OffersController_declineOffer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersController_declineOffer, request, response });

                const controller = new OffersController();

              await templateService.apiHandler({
                methodName: 'declineOffer',
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
        const argsMeController_getMe: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/me',
            authenticateMiddleware([{"apiToken":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MeController)),
            ...(fetchMiddlewares<RequestHandler>(MeController.prototype.getMe)),

            async function MeController_getMe(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMeController_getMe, request, response });

                const controller = new MeController();

              await templateService.apiHandler({
                methodName: 'getMe',
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
        const argsListingsController_getListing: Record<string, TsoaRoute.ParameterSchema> = {
                listingId: {"in":"path","name":"listingId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/listings/:listingId',
            authenticateMiddleware([{"apiToken":["listings:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsController)),
            ...(fetchMiddlewares<RequestHandler>(ListingsController.prototype.getListing)),

            async function ListingsController_getListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsController_getListing, request, response });

                const controller = new ListingsController();

              await templateService.apiHandler({
                methodName: 'getListing',
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
        const argsListingsController_getListingStock: Record<string, TsoaRoute.ParameterSchema> = {
                listingId: {"in":"path","name":"listingId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/listings/:listingId/stock',
            authenticateMiddleware([{"apiToken":["stock:read"]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsController)),
            ...(fetchMiddlewares<RequestHandler>(ListingsController.prototype.getListingStock)),

            async function ListingsController_getListingStock(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsController_getListingStock, request, response });

                const controller = new ListingsController();

              await templateService.apiHandler({
                methodName: 'getListingStock',
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
