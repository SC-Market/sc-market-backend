/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VariantTypesV2Controller } from './../variant-types/VariantTypesV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { StockLotsV2Controller } from './../stock-lots/StockLotsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OrdersV2Controller } from './../orders/OrdersV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OffersV2Controller } from './../offers/OffersV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ListingsV2Controller } from './../listings/ListingsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ImportJobsV2Controller } from './../import-jobs/ImportJobsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../health/HealthController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { GameItemsV2Controller } from './../game-items/GameItemsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WishlistsController } from './../game-data/wishlists/WishlistsController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WikiController } from './../game-data/wiki/WikiController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VersionsController } from './../game-data/versions/VersionsController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ResourcesController } from './../game-data/resources/ResourcesController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MissionsController } from './../game-data/missions/MissionsController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CraftingController } from './../game-data/crafting/CraftingController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BlueprintsController } from './../game-data/blueprints/BlueprintsController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DebugV2Controller } from './../debug/DebugV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CartV2Controller } from './../cart/CartV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BuyOrdersV2Controller } from './../buy-orders/BuyOrdersV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AvailabilityV2Controller } from './../availability/AvailabilityV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AnalyticsV2Controller } from './../analytics/AnalyticsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FeatureFlagAdminController } from './../admin/FeatureFlagAdminController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AdminController } from './../admin/AdminController.js';
import { expressAuthentication } from './../middleware/tsoa-auth.js';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "VariantType": {
        "dataType": "refObject",
        "properties": {
            "variant_type_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "display_name": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "affects_pricing": {"dataType":"boolean","required":true},
            "searchable": {"dataType":"boolean","required":true},
            "filterable": {"dataType":"boolean","required":true},
            "value_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["integer"]},{"dataType":"enum","enums":["decimal"]},{"dataType":"enum","enums":["string"]},{"dataType":"enum","enums":["enum"]}],"required":true},
            "min_value": {"dataType":"double"},
            "max_value": {"dataType":"double"},
            "allowed_values": {"dataType":"array","array":{"dataType":"string"}},
            "display_order": {"dataType":"double","required":true},
            "icon": {"dataType":"string"},
            "created_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetVariantTypesResponse": {
        "dataType": "refObject",
        "properties": {
            "variant_types": {"dataType":"array","array":{"dataType":"refObject","ref":"VariantType"},"required":true},
            "total": {"dataType":"double","required":true},
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
            "variant": {"ref":"StockLotVariant","required":true},
            "quantity_total": {"dataType":"double","required":true},
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
    "UpdateStockLotResponse": {
        "dataType": "refObject",
        "properties": {
            "lot": {"ref":"StockLotDetail","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateStockLotRequest": {
        "dataType": "refObject",
        "properties": {
            "item_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "variant_attributes": {"ref":"VariantAttributes","required":true},
            "location_id": {"dataType":"string"},
            "listed": {"dataType":"boolean"},
            "notes": {"dataType":"string"},
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
    "UpdateStockLotRequest": {
        "dataType": "refObject",
        "properties": {
            "quantity_total": {"dataType":"double"},
            "listed": {"dataType":"boolean"},
            "location_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "notes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "variant_attributes": {"ref":"VariantAttributes"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkUpdateResult": {
        "dataType": "refObject",
        "properties": {
            "lot_id": {"dataType":"string","required":true},
            "success": {"dataType":"boolean","required":true},
            "error": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkUpdateStockLotsResponse": {
        "dataType": "refObject",
        "properties": {
            "results": {"dataType":"array","array":{"dataType":"refObject","ref":"BulkUpdateResult"},"required":true},
            "success_count": {"dataType":"double","required":true},
            "failure_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkLotUpdate": {
        "dataType": "refObject",
        "properties": {
            "lot_id": {"dataType":"string","required":true},
            "quantity_total": {"dataType":"double"},
            "listed": {"dataType":"boolean"},
            "location_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkUpdateStockLotsRequest": {
        "dataType": "refObject",
        "properties": {
            "updates": {"dataType":"array","array":{"dataType":"refObject","ref":"BulkLotUpdate"},"required":true},
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
            "variant": {"ref":"OrderVariantDetail","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "subtotal": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrderResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "buyer_id": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderItemDetail"},"required":true},
            "allocation_result": {"dataType":"nestedObjectLiteral","nestedProperties":{"total_allocated":{"dataType":"double","required":true},"total_requested":{"dataType":"double","required":true},"has_partial_allocations":{"dataType":"boolean","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderItemInput": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrderRequest": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderItemInput"},"required":true},
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
            "v2_variants": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderVariantItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetOrderDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "buyer": {"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "seller": {"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "kind": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "payment_type": {"dataType":"string","required":true},
            "offer_session_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "market_listings": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderMarketListingV2"},"required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"OrderItemDetail"},"required":true},
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
            "seller_username": {"dataType":"string","required":true},
            "item_count": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "buyer_avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "seller_avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
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
    "UserSummary": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "display_name": {"dataType":"string"},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrgSummary": {
        "dataType": "refObject",
        "properties": {
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
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
            "actor_username": {"dataType":"string","required":true},
            "market_listings": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferMarketListingV2"},"required":true},
            "service": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"service_id":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
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
            "discord_invite": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "customer": {"ref":"UserSummary","required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"UserSummary"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"OrgSummary"},{"dataType":"enum","enums":[null]}],"required":true},
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferV2"},"required":true},
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
            "discord_invite": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "customer": {"ref":"UserSummary","required":true},
            "assigned_to": {"dataType":"union","subSchemas":[{"ref":"UserSummary"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor": {"dataType":"union","subSchemas":[{"ref":"OrgSummary"},{"dataType":"enum","enums":[null]}],"required":true},
            "offers": {"dataType":"array","array":{"dataType":"refObject","ref":"OfferV2"},"required":true},
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
    "CreateListingResponse": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLotInput": {
        "dataType": "refObject",
        "properties": {
            "quantity": {"dataType":"double","required":true},
            "variant_attributes": {"ref":"VariantAttributes","required":true},
            "location_id": {"dataType":"string"},
            "price": {"dataType":"double"},
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
    "CreateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "pricing_mode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unified"]},{"dataType":"enum","enums":["per_variant"]}],"required":true},
            "base_price": {"dataType":"double"},
            "lots": {"dataType":"array","array":{"dataType":"refObject","ref":"StockLotInput"},"required":true},
            "photo_resource_ids": {"dataType":"array","array":{"dataType":"string"}},
            "pickup_method": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["delivery"]},{"dataType":"enum","enums":["pickup"]},{"dataType":"enum","enums":["any"]}]},
            "quantity_unit": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unit"]},{"dataType":"enum","enums":["scu"]}]},
            "min_order_quantity": {"dataType":"double"},
            "max_order_quantity": {"dataType":"double"},
            "min_order_value": {"dataType":"double"},
            "max_order_value": {"dataType":"double"},
            "bulk_discount_tiers": {"dataType":"array","array":{"dataType":"refObject","ref":"BulkDiscountTier"}},
            "contractor_spectrum_id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingSearchResult": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "seller_name": {"dataType":"string","required":true},
            "seller_rating": {"dataType":"double","required":true},
            "price_min": {"dataType":"double","required":true},
            "price_max": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "quality_value_min": {"dataType":"double"},
            "quality_value_max": {"dataType":"double"},
            "variant_count": {"dataType":"double","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "seller_slug": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "game_item_type": {"dataType":"string","required":true},
            "seller_rating_count": {"dataType":"double","required":true},
            "seller_languages": {"dataType":"array","array":{"dataType":"string"}},
            "photo": {"dataType":"string"},
            "pickup_method": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["delivery"]},{"dataType":"enum","enums":["pickup"]},{"dataType":"enum","enums":["any"]},{"dataType":"enum","enums":[null]}]},
            "quantity_unit": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unit"]},{"dataType":"enum","enums":["scu"]}],"required":true},
            "has_bulk_discount": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "listings": {"dataType":"array","array":{"dataType":"refObject","ref":"ListingSearchResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
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
            "expires_at": {"dataType":"string"},
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
    "ListingDetail": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}],"required":true},
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
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SellerInfo": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "slug": {"dataType":"string","required":true},
            "rating": {"dataType":"double","required":true},
            "avatar_url": {"dataType":"string"},
            "languages": {"dataType":"array","array":{"dataType":"string"}},
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
    "VariantPriceUpdate": {
        "dataType": "refObject",
        "properties": {
            "variant_id": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LotUpdate": {
        "dataType": "refObject",
        "properties": {
            "lot_id": {"dataType":"string","required":true},
            "quantity_total": {"dataType":"double"},
            "listed": {"dataType":"boolean"},
            "location_id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
            "description": {"dataType":"string"},
            "base_price": {"dataType":"double"},
            "variant_prices": {"dataType":"array","array":{"dataType":"refObject","ref":"VariantPriceUpdate"}},
            "lot_updates": {"dataType":"array","array":{"dataType":"refObject","ref":"LotUpdate"}},
            "pickup_method": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["delivery"]},{"dataType":"enum","enums":["pickup"]},{"dataType":"enum","enums":["any"]},{"dataType":"enum","enums":[null]}]},
            "quantity_unit": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unit"]},{"dataType":"enum","enums":["scu"]}]},
            "min_order_quantity": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "max_order_quantity": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "min_order_value": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "max_order_value": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},
            "bulk_discount_tiers": {"dataType":"array","array":{"dataType":"refObject","ref":"BulkDiscountTier"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImportSource": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["cstone-items"]},{"dataType":"enum","enums":["uex-items"]},{"dataType":"enum","enums":["uex-attributes"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "JobStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["running"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["failed"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImportJob": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "source": {"ref":"ImportSource","required":true},
            "status": {"ref":"JobStatus","required":true},
            "startedAt": {"dataType":"string","required":true},
            "completedAt": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "result": {"dataType":"union","subSchemas":[{"ref":"Record_string.any_"},{"dataType":"enum","enums":[null]}],"required":true},
            "error": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HealthResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "timestamp": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemSearchResult": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemCategory": {
        "dataType": "refObject",
        "properties": {
            "category": {"dataType":"string","required":true},
            "game_item_categories": {"dataType":"string","required":true},
            "subcategory": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemMetadata": {
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
    "GameItemQualityDistribution": {
        "dataType": "refObject",
        "properties": {
            "quality_tier": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "price_min": {"dataType":"double","required":true},
            "price_max": {"dataType":"double","required":true},
            "price_avg": {"dataType":"double","required":true},
            "seller_count": {"dataType":"double","required":true},
            "listing_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemListingResult": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "seller_name": {"dataType":"string","required":true},
            "seller_rating": {"dataType":"double","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "seller_slug": {"dataType":"string","required":true},
            "price_min": {"dataType":"double","required":true},
            "price_max": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "variant_count": {"dataType":"double","required":true},
            "created_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetGameItemListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "game_item": {"ref":"GameItemMetadata","required":true},
            "quality_distribution": {"dataType":"array","array":{"dataType":"refObject","ref":"GameItemQualityDistribution"},"required":true},
            "listings": {"dataType":"array","array":{"dataType":"refObject","ref":"GameItemListingResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItemAggregate": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "image_url": {"dataType":"string"},
            "min_price": {"dataType":"double","required":true},
            "max_price": {"dataType":"double","required":true},
            "total_quantity": {"dataType":"double","required":true},
            "listing_count": {"dataType":"double","required":true},
            "seller_count": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchGameItemAggregatesResponse": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"GameItemAggregate"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Wishlist": {
        "dataType": "refObject",
        "properties": {
            "wishlist_id": {"dataType":"string","required":true},
            "user_id": {"dataType":"string","required":true},
            "wishlist_name": {"dataType":"string","required":true},
            "wishlist_description": {"dataType":"string"},
            "is_public": {"dataType":"boolean","required":true},
            "share_token": {"dataType":"string"},
            "organization_id": {"dataType":"string"},
            "is_collaborative": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListWishlistsResponse": {
        "dataType": "refObject",
        "properties": {
            "wishlists": {"dataType":"array","array":{"dataType":"intersection","subSchemas":[{"ref":"Wishlist"},{"dataType":"nestedObjectLiteral","nestedProperties":{"progress_percentage":{"dataType":"double","required":true},"completed_items":{"dataType":"double","required":true},"item_count":{"dataType":"double","required":true}}}]},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateWishlistRequest": {
        "dataType": "refObject",
        "properties": {
            "wishlist_name": {"dataType":"string","required":true},
            "wishlist_description": {"dataType":"string"},
            "is_public": {"dataType":"boolean","required":true},
            "organization_id": {"dataType":"string"},
            "is_collaborative": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WishlistItemWithDetails": {
        "dataType": "refObject",
        "properties": {
            "item_id": {"dataType":"string","required":true},
            "wishlist_id": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "desired_quantity": {"dataType":"double","required":true},
            "desired_quality_tier": {"dataType":"double"},
            "blueprint_id": {"dataType":"string"},
            "priority": {"dataType":"double","required":true},
            "notes": {"dataType":"string"},
            "is_acquired": {"dataType":"boolean","required":true},
            "acquired_quantity": {"dataType":"double","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "game_item_icon": {"dataType":"string"},
            "game_item_type": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string"},
            "estimated_cost": {"dataType":"double"},
            "crafting_available": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetWishlistResponse": {
        "dataType": "refObject",
        "properties": {
            "wishlist": {"ref":"Wishlist","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"WishlistItemWithDetails"},"required":true},
            "statistics": {"dataType":"nestedObjectLiteral","nestedProperties":{"total_estimated_cost":{"dataType":"double","required":true},"progress_percentage":{"dataType":"double","required":true},"completed_items":{"dataType":"double","required":true},"total_items":{"dataType":"double","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateWishlistRequest": {
        "dataType": "refObject",
        "properties": {
            "wishlist_name": {"dataType":"string"},
            "wishlist_description": {"dataType":"string"},
            "is_public": {"dataType":"boolean"},
            "is_collaborative": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddWishlistItemRequest": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "desired_quantity": {"dataType":"double","required":true},
            "desired_quality_tier": {"dataType":"double"},
            "blueprint_id": {"dataType":"string"},
            "priority": {"dataType":"double","required":true},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateWishlistItemRequest": {
        "dataType": "refObject",
        "properties": {
            "desired_quantity": {"dataType":"double"},
            "desired_quality_tier": {"dataType":"double"},
            "priority": {"dataType":"double"},
            "notes": {"dataType":"string"},
            "is_acquired": {"dataType":"boolean"},
            "acquired_quantity": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShoppingListMaterial": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "game_item_icon": {"dataType":"string"},
            "total_quantity_needed": {"dataType":"double","required":true},
            "desired_quality_tier": {"dataType":"double"},
            "user_inventory_quantity": {"dataType":"double","required":true},
            "quantity_to_acquire": {"dataType":"double","required":true},
            "estimated_unit_price": {"dataType":"double"},
            "estimated_total_cost": {"dataType":"double"},
            "acquisition_methods": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "used_by_items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"quantity_for_this_item":{"dataType":"double","required":true},"item_name":{"dataType":"string","required":true},"wishlist_item_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShoppingListResponse": {
        "dataType": "refObject",
        "properties": {
            "wishlist_id": {"dataType":"string","required":true},
            "wishlist_name": {"dataType":"string","required":true},
            "materials_needed": {"dataType":"array","array":{"dataType":"refObject","ref":"ShoppingListMaterial"},"required":true},
            "total_estimated_cost": {"dataType":"double","required":true},
            "materials_fully_stocked": {"dataType":"double","required":true},
            "materials_partially_stocked": {"dataType":"double","required":true},
            "materials_not_stocked": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiItemSearchResult": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string"},
            "sub_type": {"dataType":"string"},
            "size": {"dataType":"string"},
            "grade": {"dataType":"string"},
            "manufacturer": {"dataType":"string"},
            "image_url": {"dataType":"string"},
            "thumbnail_path": {"dataType":"string"},
            "display_type": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchWikiItemsResponse": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"WikiItemSearchResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintReference": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "crafting_time_seconds": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionRewardReference": {
        "dataType": "refObject",
        "properties": {
            "mission_id": {"dataType":"string","required":true},
            "mission_name": {"dataType":"string","required":true},
            "star_system": {"dataType":"string"},
            "drop_probability": {"dataType":"double","required":true},
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarketStats": {
        "dataType": "refObject",
        "properties": {
            "listing_count": {"dataType":"double","required":true},
            "min_price": {"dataType":"double"},
            "max_price": {"dataType":"double"},
            "total_quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiItemDetail": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string"},
            "sub_type": {"dataType":"string"},
            "size": {"dataType":"string"},
            "grade": {"dataType":"string"},
            "manufacturer": {"dataType":"string"},
            "image_url": {"dataType":"string"},
            "thumbnail_path": {"dataType":"string"},
            "display_type": {"dataType":"string"},
            "p4k_id": {"dataType":"string"},
            "p4k_file": {"dataType":"string"},
            "name_key": {"dataType":"string"},
            "attributes": {"ref":"Record_string.any_","required":true},
            "craftable_from": {"dataType":"array","array":{"dataType":"refObject","ref":"BlueprintReference"},"required":true},
            "rewarded_by": {"dataType":"array","array":{"dataType":"refObject","ref":"MissionRewardReference"},"required":true},
            "market_stats": {"ref":"MarketStats","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiShipSearchResult": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "manufacturer": {"dataType":"string"},
            "focus": {"dataType":"string"},
            "size": {"dataType":"string"},
            "image_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiShipDetail": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "manufacturer": {"dataType":"string"},
            "focus": {"dataType":"string"},
            "size": {"dataType":"string"},
            "description": {"dataType":"string"},
            "movement_class": {"dataType":"string"},
            "image_url": {"dataType":"string"},
            "default_loadout": {"dataType":"any"},
            "attributes": {"ref":"Record_string.any_","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiCommoditySearchResult": {
        "dataType": "refObject",
        "properties": {
            "resource_id": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "resource_category": {"dataType":"string","required":true},
            "resource_subcategory": {"dataType":"string"},
            "can_be_mined": {"dataType":"boolean","required":true},
            "can_be_purchased": {"dataType":"boolean","required":true},
            "can_be_salvaged": {"dataType":"boolean","required":true},
            "can_be_looted": {"dataType":"boolean","required":true},
            "image_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiLocationNode": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "parent_id": {"dataType":"string"},
            "children": {"dataType":"array","array":{"dataType":"refObject","ref":"WikiLocationNode"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiManufacturerSearchResult": {
        "dataType": "refObject",
        "properties": {
            "manufacturer": {"dataType":"string","required":true},
            "item_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ManufacturerItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string"},
            "size": {"dataType":"string"},
            "grade": {"dataType":"string"},
            "image_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WikiManufacturerDetail": {
        "dataType": "refObject",
        "properties": {
            "manufacturer": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "item_count": {"dataType":"double","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"ManufacturerItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameVersion": {
        "dataType": "refObject",
        "properties": {
            "version_id": {"dataType":"string","required":true},
            "version_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["LIVE"]},{"dataType":"enum","enums":["PTU"]},{"dataType":"enum","enums":["EPTU"]}],"required":true},
            "version_number": {"dataType":"string","required":true},
            "build_number": {"dataType":"string"},
            "release_date": {"dataType":"string"},
            "is_active": {"dataType":"boolean","required":true},
            "last_data_update": {"dataType":"string"},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ActiveVersionsResponse": {
        "dataType": "refObject",
        "properties": {
            "LIVE": {"ref":"GameVersion"},
            "PTU": {"ref":"GameVersion"},
            "EPTU": {"ref":"GameVersion"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SelectVersionResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "version": {"ref":"GameVersion"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SelectVersionRequest": {
        "dataType": "refObject",
        "properties": {
            "version_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResourceSearchResult": {
        "dataType": "refObject",
        "properties": {
            "resource_id": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "resource_name": {"dataType":"string","required":true},
            "resource_icon": {"dataType":"string"},
            "resource_category": {"dataType":"string","required":true},
            "resource_subcategory": {"dataType":"string"},
            "max_stack_size": {"dataType":"double"},
            "base_value": {"dataType":"double"},
            "can_be_mined": {"dataType":"boolean","required":true},
            "can_be_purchased": {"dataType":"boolean","required":true},
            "can_be_salvaged": {"dataType":"boolean","required":true},
            "can_be_looted": {"dataType":"boolean","required":true},
            "blueprint_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchResourcesResponse": {
        "dataType": "refObject",
        "properties": {
            "resources": {"dataType":"array","array":{"dataType":"refObject","ref":"ResourceSearchResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MiningLocation": {
        "dataType": "refObject",
        "properties": {
            "star_system": {"dataType":"string"},
            "planet_moon": {"dataType":"string"},
            "location_detail": {"dataType":"string"},
            "abundance": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PurchaseLocation": {
        "dataType": "refObject",
        "properties": {
            "star_system": {"dataType":"string"},
            "planet_moon": {"dataType":"string"},
            "station": {"dataType":"string"},
            "average_price": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Resource": {
        "dataType": "refObject",
        "properties": {
            "resource_id": {"dataType":"string","required":true},
            "version_id": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "resource_name": {"dataType":"string","required":true},
            "resource_icon": {"dataType":"string"},
            "resource_category": {"dataType":"string","required":true},
            "resource_subcategory": {"dataType":"string"},
            "max_stack_size": {"dataType":"double"},
            "base_value": {"dataType":"double"},
            "can_be_mined": {"dataType":"boolean","required":true},
            "can_be_purchased": {"dataType":"boolean","required":true},
            "can_be_salvaged": {"dataType":"boolean","required":true},
            "can_be_looted": {"dataType":"boolean","required":true},
            "mining_locations": {"dataType":"array","array":{"dataType":"refObject","ref":"MiningLocation"}},
            "purchase_locations": {"dataType":"array","array":{"dataType":"refObject","ref":"PurchaseLocation"}},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintRequiringResource": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "output_item_icon": {"dataType":"string"},
            "quantity_required": {"dataType":"double","required":true},
            "min_quality_tier": {"dataType":"double"},
            "recommended_quality_tier": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResourceDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "resource": {"ref":"Resource","required":true},
            "blueprints_requiring": {"dataType":"array","array":{"dataType":"refObject","ref":"BlueprintRequiringResource"},"required":true},
            "market_price": {"dataType":"nestedObjectLiteral","nestedProperties":{"last_updated":{"dataType":"string"},"average_price":{"dataType":"double"},"max_price":{"dataType":"double"},"min_price":{"dataType":"double"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResourceCategory": {
        "dataType": "refObject",
        "properties": {
            "category": {"dataType":"string","required":true},
            "subcategory": {"dataType":"string"},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HaulingOrder": {
        "dataType": "refObject",
        "properties": {
            "resource_name": {"dataType":"string","required":true},
            "min_scu": {"dataType":"double","required":true},
            "max_scu": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionSearchResult": {
        "dataType": "refObject",
        "properties": {
            "mission_id": {"dataType":"string","required":true},
            "mission_code": {"dataType":"string","required":true},
            "mission_name": {"dataType":"string","required":true},
            "category": {"dataType":"string","required":true},
            "career_type": {"dataType":"string"},
            "legal_status": {"dataType":"string"},
            "difficulty_level": {"dataType":"double"},
            "star_system": {"dataType":"string"},
            "planet_moon": {"dataType":"string"},
            "faction": {"dataType":"string"},
            "credit_reward_min": {"dataType":"double"},
            "credit_reward_max": {"dataType":"double"},
            "blueprint_reward_count": {"dataType":"double","required":true},
            "community_difficulty_avg": {"dataType":"double"},
            "community_satisfaction_avg": {"dataType":"double"},
            "is_chain_starter": {"dataType":"boolean","required":true},
            "is_chain_mission": {"dataType":"boolean","required":true},
            "is_shareable": {"dataType":"boolean","required":true},
            "is_unique_mission": {"dataType":"boolean","required":true},
            "is_illegal": {"dataType":"boolean"},
            "reputation_reward": {"dataType":"double"},
            "reward_scope": {"dataType":"string"},
            "mission_giver_org": {"dataType":"string"},
            "associated_event": {"dataType":"string"},
            "ship_encounter_count": {"dataType":"double","required":true},
            "hauling_orders": {"dataType":"array","array":{"dataType":"refObject","ref":"HaulingOrder"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchMissionsResponse": {
        "dataType": "refObject",
        "properties": {
            "missions": {"dataType":"array","array":{"dataType":"refObject","ref":"MissionSearchResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ItemReward": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "ref": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Mission": {
        "dataType": "refObject",
        "properties": {
            "mission_id": {"dataType":"string","required":true},
            "version_id": {"dataType":"string","required":true},
            "mission_code": {"dataType":"string","required":true},
            "mission_name": {"dataType":"string","required":true},
            "mission_description": {"dataType":"string"},
            "category": {"dataType":"string","required":true},
            "mission_type": {"dataType":"string"},
            "career_type": {"dataType":"string"},
            "legal_status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["LEGAL"]},{"dataType":"enum","enums":["ILLEGAL"]},{"dataType":"enum","enums":["UNKNOWN"]}]},
            "difficulty_level": {"dataType":"double"},
            "star_system": {"dataType":"string"},
            "planet_moon": {"dataType":"string"},
            "location_detail": {"dataType":"string"},
            "mission_giver_org": {"dataType":"string"},
            "faction": {"dataType":"string"},
            "credit_reward_min": {"dataType":"double"},
            "credit_reward_max": {"dataType":"double"},
            "reputation_reward": {"dataType":"double"},
            "is_shareable": {"dataType":"boolean","required":true},
            "availability_type": {"dataType":"string"},
            "associated_event": {"dataType":"string"},
            "required_rank": {"dataType":"double"},
            "required_reputation": {"dataType":"double"},
            "is_chain_starter": {"dataType":"boolean","required":true},
            "is_chain_mission": {"dataType":"boolean","required":true},
            "is_unique_mission": {"dataType":"boolean","required":true},
            "prerequisite_missions": {"dataType":"any"},
            "estimated_uec_per_hour": {"dataType":"double"},
            "estimated_rep_per_hour": {"dataType":"double"},
            "rank_index": {"dataType":"double"},
            "reward_scope": {"dataType":"string"},
            "min_standing": {"dataType":"string"},
            "max_standing": {"dataType":"string"},
            "min_standing_display": {"dataType":"string"},
            "max_standing_display": {"dataType":"string"},
            "can_reaccept_after_failing": {"dataType":"boolean"},
            "can_reaccept_after_abandoning": {"dataType":"boolean"},
            "abandoned_cooldown_time": {"dataType":"double"},
            "personal_cooldown_time": {"dataType":"double"},
            "deadline_seconds": {"dataType":"double"},
            "available_in_prison": {"dataType":"boolean"},
            "is_illegal": {"dataType":"boolean"},
            "is_lawful": {"dataType":"boolean"},
            "max_crimestat": {"dataType":"double"},
            "difficulty_from_broker": {"dataType":"double"},
            "time_to_complete": {"dataType":"double"},
            "accept_locations": {"dataType":"array","array":{"dataType":"string"}},
            "destinations": {"dataType":"array","array":{"dataType":"string"}},
            "item_rewards": {"dataType":"array","array":{"dataType":"refObject","ref":"ItemReward"}},
            "token_substitutions": {"ref":"Record_string.string_"},
            "community_difficulty_avg": {"dataType":"double"},
            "community_difficulty_count": {"dataType":"double","required":true},
            "community_satisfaction_avg": {"dataType":"double"},
            "community_satisfaction_count": {"dataType":"double","required":true},
            "data_source": {"dataType":"string","required":true},
            "is_verified": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionBlueprintReward": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "output_item_icon": {"dataType":"string"},
            "drop_probability": {"dataType":"double","required":true},
            "is_guaranteed": {"dataType":"boolean","required":true},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "user_owns": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionRewardPool": {
        "dataType": "refObject",
        "properties": {
            "reward_pool_id": {"dataType":"double","required":true},
            "pool_name": {"dataType":"string"},
            "pool_chance": {"dataType":"double"},
            "reward_pool_size": {"dataType":"double","required":true},
            "selection_count": {"dataType":"double","required":true},
            "blueprints": {"dataType":"array","array":{"dataType":"refObject","ref":"MissionBlueprintReward"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShipWave": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "min_ships": {"dataType":"double","required":true},
            "max_ships": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShipEncounter": {
        "dataType": "refObject",
        "properties": {
            "role": {"dataType":"string","required":true},
            "alignment": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["hostile"]},{"dataType":"enum","enums":["friendly"]},{"dataType":"enum","enums":["neutral"]}],"required":true},
            "waves": {"dataType":"array","array":{"dataType":"refObject","ref":"ShipWave"},"required":true},
            "ship_pool": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NpcEncounter": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EntitySpawn": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserMissionRating": {
        "dataType": "refObject",
        "properties": {
            "difficulty_rating": {"dataType":"double","required":true},
            "satisfaction_rating": {"dataType":"double","required":true},
            "rating_comment": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "mission": {"ref":"Mission","required":true},
            "blueprint_rewards": {"dataType":"array","array":{"dataType":"refObject","ref":"MissionRewardPool"},"required":true},
            "prerequisite_missions": {"dataType":"array","array":{"dataType":"refObject","ref":"Mission"}},
            "ship_encounters": {"dataType":"array","array":{"dataType":"refObject","ref":"ShipEncounter"}},
            "npc_encounters": {"dataType":"array","array":{"dataType":"refObject","ref":"NpcEncounter"}},
            "hauling_orders": {"dataType":"array","array":{"dataType":"refObject","ref":"HaulingOrder"}},
            "entity_spawns": {"dataType":"array","array":{"dataType":"refObject","ref":"EntitySpawn"}},
            "user_completed": {"dataType":"boolean"},
            "user_rating": {"ref":"UserMissionRating"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintDetail": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_code": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "blueprint_description": {"dataType":"string"},
            "output_game_item_id": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "output_item_type": {"dataType":"string","required":true},
            "output_item_icon": {"dataType":"string"},
            "output_quantity": {"dataType":"double","required":true},
            "item_category": {"dataType":"string"},
            "item_subcategory": {"dataType":"string"},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "crafting_station_type": {"dataType":"string"},
            "crafting_time_seconds": {"dataType":"double"},
            "required_skill_level": {"dataType":"double"},
            "icon_url": {"dataType":"string"},
            "ingredient_count": {"dataType":"double","required":true},
            "drop_probability": {"dataType":"double","required":true},
            "is_guaranteed": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ReputationRank": {
        "dataType": "refObject",
        "properties": {
            "scope_code": {"dataType":"string","required":true},
            "scope_display_name": {"dataType":"string","required":true},
            "standing_code": {"dataType":"string","required":true},
            "standing_display_name": {"dataType":"string","required":true},
            "threshold": {"dataType":"double","required":true},
            "ceiling": {"dataType":"double","required":true},
            "rank_index": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameEvent": {
        "dataType": "refObject",
        "properties": {
            "event_id": {"dataType":"string","required":true},
            "event_code": {"dataType":"string","required":true},
            "event_name": {"dataType":"string","required":true},
            "mission_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.number_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"double"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QualityContribution": {
        "dataType": "refObject",
        "properties": {
            "material_name": {"dataType":"string","required":true},
            "quality_tier": {"dataType":"double","required":true},
            "quality_value": {"dataType":"double","required":true},
            "weight": {"dataType":"double","required":true},
            "contribution": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CalculateQualityResponse": {
        "dataType": "refObject",
        "properties": {
            "output_quality_tier": {"dataType":"double","required":true},
            "output_quality_value": {"dataType":"double","required":true},
            "output_quantity": {"dataType":"double","required":true},
            "calculation_breakdown": {"dataType":"nestedObjectLiteral","nestedProperties":{"quality_contributions":{"dataType":"array","array":{"dataType":"refObject","ref":"QualityContribution"},"required":true},"input_weights":{"ref":"Record_string.number_","required":true},"formula_used":{"dataType":"string","required":true}},"required":true},
            "estimated_cost": {"dataType":"nestedObjectLiteral","nestedProperties":{"total_cost":{"dataType":"double","required":true},"crafting_station_fee":{"dataType":"double"},"material_cost":{"dataType":"double","required":true}},"required":true},
            "success_probability": {"dataType":"double","required":true},
            "critical_success_chance": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CraftingInputMaterial": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "quality_tier": {"dataType":"double"},
            "quality_value": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CalculateQualityRequest": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "input_materials": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftingInputMaterial"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SimulationResult": {
        "dataType": "refObject",
        "properties": {
            "material_configuration": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftingInputMaterial"},"required":true},
            "output_quality_tier": {"dataType":"double","required":true},
            "output_quality_value": {"dataType":"double","required":true},
            "estimated_cost": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SimulateCraftingResponse": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "simulation_results": {"dataType":"array","array":{"dataType":"refObject","ref":"SimulationResult"},"required":true},
            "best_result": {"ref":"SimulationResult","required":true},
            "worst_result": {"ref":"SimulationResult","required":true},
            "most_cost_effective": {"ref":"SimulationResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MaterialVariation": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "quality_tiers": {"dataType":"array","array":{"dataType":"double"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SimulateCraftingRequest": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "material_variations": {"dataType":"array","array":{"dataType":"refObject","ref":"MaterialVariation"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecordCraftingResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "session_id": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecordCraftingRequest": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "input_materials": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftingInputMaterial"},"required":true},
            "output_quality_tier": {"dataType":"double","required":true},
            "output_quality_value": {"dataType":"double","required":true},
            "output_quantity": {"dataType":"double","required":true},
            "was_critical_success": {"dataType":"boolean","required":true},
            "total_material_cost": {"dataType":"double"},
            "crafting_station_fee": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CraftingSessionHistory": {
        "dataType": "refObject",
        "properties": {
            "session_id": {"dataType":"string","required":true},
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "crafting_date": {"dataType":"string","required":true},
            "input_materials": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftingInputMaterial"},"required":true},
            "output_quality_tier": {"dataType":"double","required":true},
            "output_quality_value": {"dataType":"double","required":true},
            "output_quantity": {"dataType":"double","required":true},
            "was_critical_success": {"dataType":"boolean","required":true},
            "total_material_cost": {"dataType":"double"},
            "crafting_station_fee": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetCraftingHistoryResponse": {
        "dataType": "refObject",
        "properties": {
            "history": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftingSessionHistory"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MaterialAvailability": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "material_name": {"dataType":"string","required":true},
            "quantity_required": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "is_sufficient": {"dataType":"boolean","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "stock_lot_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CraftableItem": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "output_item_icon": {"dataType":"string"},
            "item_category": {"dataType":"string"},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "crafting_time_seconds": {"dataType":"double"},
            "can_craft": {"dataType":"boolean","required":true},
            "max_craftable_quantity": {"dataType":"double","required":true},
            "materials": {"dataType":"array","array":{"dataType":"refObject","ref":"MaterialAvailability"},"required":true},
            "missing_materials_count": {"dataType":"double","required":true},
            "estimated_cost_per_craft": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetCraftableItemsResponse": {
        "dataType": "refObject",
        "properties": {
            "craftable_items": {"dataType":"array","array":{"dataType":"refObject","ref":"CraftableItem"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
            "summary": {"dataType":"nestedObjectLiteral","nestedProperties":{"items_missing_materials":{"dataType":"double","required":true},"items_craftable_now":{"dataType":"double","required":true},"total_blueprints_owned":{"dataType":"double","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintStatistics": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "total_crafts": {"dataType":"double","required":true},
            "average_quality": {"dataType":"double","required":true},
            "success_rate": {"dataType":"double","required":true},
            "critical_successes": {"dataType":"double","required":true},
            "total_materials_cost": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetCraftingStatisticsResponse": {
        "dataType": "refObject",
        "properties": {
            "total_sessions": {"dataType":"double","required":true},
            "unique_blueprints_crafted": {"dataType":"double","required":true},
            "average_output_quality": {"dataType":"double","required":true},
            "total_critical_successes": {"dataType":"double","required":true},
            "critical_success_rate": {"dataType":"double","required":true},
            "total_materials_cost": {"dataType":"double","required":true},
            "blueprint_statistics": {"dataType":"array","array":{"dataType":"refObject","ref":"BlueprintStatistics"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintSearchResult": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "blueprint_code": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "output_item_name": {"dataType":"string","required":true},
            "output_item_icon": {"dataType":"string"},
            "item_category": {"dataType":"string"},
            "item_subcategory": {"dataType":"string"},
            "manufacturer": {"dataType":"string"},
            "source": {"dataType":"string"},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "ingredient_count": {"dataType":"double","required":true},
            "ingredients": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"quantity_required":{"dataType":"double","required":true},"icon_url":{"dataType":"string"},"sub_type":{"dataType":"string"},"name":{"dataType":"string","required":true}}},"required":true},
            "mission_count": {"dataType":"double","required":true},
            "crafting_time_seconds": {"dataType":"double"},
            "modifier_properties": {"dataType":"array","array":{"dataType":"string"}},
            "user_owns": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchBlueprintsResponse": {
        "dataType": "refObject",
        "properties": {
            "blueprints": {"dataType":"array","array":{"dataType":"refObject","ref":"BlueprintSearchResult"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Blueprint": {
        "dataType": "refObject",
        "properties": {
            "blueprint_id": {"dataType":"string","required":true},
            "version_id": {"dataType":"string","required":true},
            "blueprint_code": {"dataType":"string","required":true},
            "blueprint_name": {"dataType":"string","required":true},
            "blueprint_description": {"dataType":"string"},
            "output_game_item_id": {"dataType":"string","required":true},
            "output_quantity": {"dataType":"double","required":true},
            "item_category": {"dataType":"string"},
            "item_subcategory": {"dataType":"string"},
            "rarity": {"dataType":"string"},
            "tier": {"dataType":"double"},
            "crafting_station_type": {"dataType":"string"},
            "crafting_time_seconds": {"dataType":"double"},
            "required_skill_level": {"dataType":"double"},
            "icon_url": {"dataType":"string"},
            "is_active": {"dataType":"boolean","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameItem": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "sub_type": {"dataType":"string"},
            "icon_url": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintIngredient": {
        "dataType": "refObject",
        "properties": {
            "ingredient_id": {"dataType":"string","required":true},
            "game_item": {"ref":"GameItem","required":true},
            "quantity_required": {"dataType":"double","required":true},
            "min_quality_tier": {"dataType":"double"},
            "recommended_quality_tier": {"dataType":"double"},
            "is_alternative": {"dataType":"boolean","required":true},
            "alternative_group": {"dataType":"double"},
            "slot_name": {"dataType":"string"},
            "slot_display_name": {"dataType":"string"},
            "market_price_min": {"dataType":"double"},
            "market_price_max": {"dataType":"double"},
            "user_inventory_quantity": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MissionRewardingBlueprint": {
        "dataType": "refObject",
        "properties": {
            "mission_id": {"dataType":"string","required":true},
            "mission_name": {"dataType":"string","required":true},
            "drop_probability": {"dataType":"double","required":true},
            "star_system": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SlotModifier": {
        "dataType": "refObject",
        "properties": {
            "slot_name": {"dataType":"string","required":true},
            "slot_display_name": {"dataType":"string","required":true},
            "property": {"dataType":"string","required":true},
            "start_quality": {"dataType":"double","required":true},
            "end_quality": {"dataType":"double","required":true},
            "modifier_at_start": {"dataType":"double","required":true},
            "modifier_at_end": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserBlueprintAcquisition": {
        "dataType": "refObject",
        "properties": {
            "acquisition_date": {"dataType":"string","required":true},
            "acquisition_method": {"dataType":"string"},
            "acquisition_location": {"dataType":"string"},
            "acquisition_notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "blueprint": {"ref":"Blueprint","required":true},
            "output_item": {"ref":"GameItem","required":true},
            "ingredients": {"dataType":"array","array":{"dataType":"refObject","ref":"BlueprintIngredient"},"required":true},
            "missions_rewarding": {"dataType":"array","array":{"dataType":"refObject","ref":"MissionRewardingBlueprint"},"required":true},
            "crafting_recipe": {"dataType":"nestedObjectLiteral","nestedProperties":{"max_output_quality_tier":{"dataType":"double","required":true},"min_output_quality_tier":{"dataType":"double","required":true},"quality_calculation_type":{"dataType":"string","required":true}}},
            "slot_modifiers": {"dataType":"array","array":{"dataType":"refObject","ref":"SlotModifier"},"required":true},
            "item_attributes": {"ref":"Record_string.string_","required":true},
            "user_owns": {"dataType":"boolean"},
            "user_acquisition": {"ref":"UserBlueprintAcquisition"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlueprintCategory": {
        "dataType": "refObject",
        "properties": {
            "category": {"dataType":"string","required":true},
            "subcategory": {"dataType":"string"},
            "count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarketVersion": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["V1"]},{"dataType":"enum","enums":["V2"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.boolean_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"boolean"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetFeatureFlagResponse": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
            "is_developer": {"dataType":"boolean","required":true},
            "has_override": {"dataType":"boolean","required":true},
            "flags": {"ref":"Record_string.boolean_","required":true},
            "overridden_flags": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SetFeatureFlagResponse": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SetFeatureFlagRequest": {
        "dataType": "refObject",
        "properties": {
            "market_version": {"ref":"MarketVersion","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartListingInfo": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "seller_name": {"dataType":"string","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "seller_slug": {"dataType":"string","required":true},
            "seller_rating": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "seller_next_available": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartVariantDetail": {
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
    "CartItemDetail": {
        "dataType": "refObject",
        "properties": {
            "cart_item_id": {"dataType":"string","required":true},
            "listing": {"ref":"CartListingInfo","required":true},
            "variant": {"ref":"CartVariantDetail","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "subtotal": {"dataType":"double","required":true},
            "available": {"dataType":"boolean","required":true},
            "price_changed": {"dataType":"boolean","required":true},
            "current_price": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetCartResponse": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"CartItemDetail"},"required":true},
            "total_price": {"dataType":"double","required":true},
            "item_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddToCartResponse": {
        "dataType": "refObject",
        "properties": {
            "cart_item_id": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddToCartRequest": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateCartItemRequest": {
        "dataType": "refObject",
        "properties": {
            "quantity": {"dataType":"double"},
            "variant_id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UnavailableCartItem": {
        "dataType": "refObject",
        "properties": {
            "cart_item_id": {"dataType":"string","required":true},
            "listing_title": {"dataType":"string","required":true},
            "variant_display_name": {"dataType":"string","required":true},
            "reason": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutCartResponse": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"string","required":true},
            "offer_id": {"dataType":"string","required":true},
            "session_id": {"dataType":"string","required":true},
            "discord_invite": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "unavailable_items": {"dataType":"array","array":{"dataType":"refObject","ref":"UnavailableCartItem"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutCartRequest": {
        "dataType": "refObject",
        "properties": {
            "confirm_price_changes": {"dataType":"boolean"},
            "note": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BuyOrderVariantDetail": {
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
    "BuyOrderItemDetail": {
        "dataType": "refObject",
        "properties": {
            "order_item_id": {"dataType":"string","required":true},
            "listing_id": {"dataType":"string","required":true},
            "item_id": {"dataType":"string","required":true},
            "variant": {"ref":"BuyOrderVariantDetail","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "subtotal": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateBuyOrderResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "buyer_id": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "item": {"ref":"BuyOrderItemDetail","required":true},
            "allocation_result": {"dataType":"nestedObjectLiteral","nestedProperties":{"total_allocated":{"dataType":"double","required":true},"total_requested":{"dataType":"double","required":true},"has_partial_allocations":{"dataType":"boolean","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateBuyOrderRequest": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StandingBuyOrder": {
        "dataType": "refObject",
        "properties": {
            "buy_order_id": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "game_item_type": {"dataType":"string"},
            "buyer_id": {"dataType":"string","required":true},
            "buyer_name": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "quality_value_min": {"dataType":"double"},
            "quality_value_max": {"dataType":"double"},
            "negotiable": {"dataType":"boolean","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]},{"dataType":"enum","enums":["expired"]}],"required":true},
            "created_at": {"dataType":"string","required":true},
            "expires_at": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateStandingBuyOrderRequest": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "quality_value_min": {"dataType":"double"},
            "quality_value_max": {"dataType":"double"},
            "negotiable": {"dataType":"boolean"},
            "expires_in_days": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchBuyOrdersResponse": {
        "dataType": "refObject",
        "properties": {
            "buy_orders": {"dataType":"array","array":{"dataType":"refObject","ref":"StandingBuyOrder"},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateStandingBuyOrderRequest": {
        "dataType": "refObject",
        "properties": {
            "quantity": {"dataType":"double"},
            "price_per_unit": {"dataType":"double"},
            "quality_tier_min": {"dataType":"double"},
            "quality_tier_max": {"dataType":"double"},
            "quality_value_min": {"dataType":"double"},
            "quality_value_max": {"dataType":"double"},
            "negotiable": {"dataType":"boolean"},
            "expires_in_days": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SellerNextAvailableResponse": {
        "dataType": "refObject",
        "properties": {
            "next_available": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "has_schedule": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PriceDataPoint": {
        "dataType": "refObject",
        "properties": {
            "timestamp": {"dataType":"string","required":true},
            "avg_price": {"dataType":"double","required":true},
            "min_price": {"dataType":"double","required":true},
            "max_price": {"dataType":"double","required":true},
            "volume": {"dataType":"double","required":true},
            "quality_tier": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetPriceHistoryResponse": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"PriceDataPoint"},"required":true},
            "start_date": {"dataType":"string","required":true},
            "end_date": {"dataType":"string","required":true},
            "interval": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QualityTierDistribution": {
        "dataType": "refObject",
        "properties": {
            "quality_tier": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "listing_count": {"dataType":"double","required":true},
            "avg_price": {"dataType":"double","required":true},
            "min_price": {"dataType":"double","required":true},
            "max_price": {"dataType":"double","required":true},
            "seller_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetQualityDistributionResponse": {
        "dataType": "refObject",
        "properties": {
            "game_item_id": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "distribution": {"dataType":"array","array":{"dataType":"refObject","ref":"QualityTierDistribution"},"required":true},
            "total_quantity": {"dataType":"double","required":true},
            "start_date": {"dataType":"string"},
            "end_date": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QualityTierSales": {
        "dataType": "refObject",
        "properties": {
            "quality_tier": {"dataType":"double","required":true},
            "volume": {"dataType":"double","required":true},
            "avg_price": {"dataType":"double","required":true},
            "avg_time_to_sale_hours": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QualityTierPremium": {
        "dataType": "refObject",
        "properties": {
            "quality_tier": {"dataType":"double","required":true},
            "premium_percentage": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetSellerStatsResponse": {
        "dataType": "refObject",
        "properties": {
            "seller_id": {"dataType":"string","required":true},
            "sales_by_quality": {"dataType":"array","array":{"dataType":"refObject","ref":"QualityTierSales"},"required":true},
            "inventory_distribution": {"dataType":"array","array":{"dataType":"refObject","ref":"QualityTierDistribution"},"required":true},
            "price_premiums": {"dataType":"array","array":{"dataType":"refObject","ref":"QualityTierPremium"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FeatureFlagConfig": {
        "dataType": "refObject",
        "properties": {
            "flag_name": {"dataType":"string","required":true},
            "default_version": {"ref":"MarketVersion","required":true},
            "rollout_percentage": {"dataType":"double","required":true},
            "enabled": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateConfigRequest": {
        "dataType": "refObject",
        "properties": {
            "flag_name": {"dataType":"string"},
            "default_version": {"ref":"MarketVersion"},
            "rollout_percentage": {"dataType":"double"},
            "enabled": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FeatureFlagStats": {
        "dataType": "refObject",
        "properties": {
            "flag_name": {"dataType":"string","required":true},
            "enabled": {"dataType":"boolean","required":true},
            "default_version": {"ref":"MarketVersion","required":true},
            "rollout_percentage": {"dataType":"double","required":true},
            "override_count": {"dataType":"double","required":true},
            "enabled_overrides": {"dataType":"double","required":true},
            "disabled_overrides": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserOverrideWithName": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
            "updated_at": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserOverridesResponse": {
        "dataType": "refObject",
        "properties": {
            "overrides": {"dataType":"array","array":{"dataType":"refObject","ref":"UserOverrideWithName"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SetUserOverrideRequest": {
        "dataType": "refObject",
        "properties": {
            "username": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImportErrorResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"enum","enums":[false],"required":true},
            "error": {"dataType":"string","required":true},
            "details": {"dataType":"string"},
            "timestamp": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImportGameDataResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "summary": {"dataType":"nestedObjectLiteral","nestedProperties":{"blueprintsUpdated":{"dataType":"double","required":true},"blueprintsInserted":{"dataType":"double","required":true},"blueprintsProcessed":{"dataType":"double","required":true},"missionsUpdated":{"dataType":"double","required":true},"missionsInserted":{"dataType":"double","required":true},"missionsProcessed":{"dataType":"double","required":true},"fullSetsCreated":{"dataType":"double","required":true},"nameChanges":{"dataType":"double","required":true},"updated":{"dataType":"double","required":true},"inserted":{"dataType":"double","required":true},"matchedFuzzy":{"dataType":"double","required":true},"matchedCStoneUUID":{"dataType":"double","required":true},"matchedExact":{"dataType":"double","required":true},"matched":{"dataType":"double","required":true},"existingDBItems":{"dataType":"double","required":true},"validP4KItems":{"dataType":"double","required":true},"totalP4KItems":{"dataType":"double","required":true}},"required":true},
            "errors": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "timestamp": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GameDataImportJob": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["validating"]},{"dataType":"enum","enums":["extracting"]},{"dataType":"enum","enums":["importing"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["failed"]}],"required":true},
            "startedAt": {"dataType":"string","required":true},
            "completedAt": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "progress": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "result": {"dataType":"union","subSchemas":[{"ref":"ImportGameDataResponse"},{"dataType":"enum","enums":[null]}],"required":true},
            "error": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "details": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
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


    
        const argsVariantTypesV2Controller_getVariantTypes: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/variant-types',
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller.prototype.getVariantTypes)),

            async function VariantTypesV2Controller_getVariantTypes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVariantTypesV2Controller_getVariantTypes, request, response });

                const controller = new VariantTypesV2Controller();

              await templateService.apiHandler({
                methodName: 'getVariantTypes',
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
        const argsStockLotsV2Controller_createStockLot: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateStockLotRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/stock-lots',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller.prototype.createStockLot)),

            async function StockLotsV2Controller_createStockLot(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStockLotsV2Controller_createStockLot, request, response });

                const controller = new StockLotsV2Controller();

              await templateService.apiHandler({
                methodName: 'createStockLot',
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
        const argsStockLotsV2Controller_getStockLots: Record<string, TsoaRoute.ParameterSchema> = {
                listing_id: {"in":"query","name":"listing_id","dataType":"string"},
                game_item_id: {"in":"query","name":"game_item_id","dataType":"string"},
                location_id: {"in":"query","name":"location_id","dataType":"string"},
                listed: {"in":"query","name":"listed","dataType":"boolean"},
                variant_id: {"in":"query","name":"variant_id","dataType":"string"},
                quality_tier_min: {"in":"query","name":"quality_tier_min","dataType":"double"},
                quality_tier_max: {"in":"query","name":"quality_tier_max","dataType":"double"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/stock-lots',
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller.prototype.getStockLots)),

            async function StockLotsV2Controller_getStockLots(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStockLotsV2Controller_getStockLots, request, response });

                const controller = new StockLotsV2Controller();

              await templateService.apiHandler({
                methodName: 'getStockLots',
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
        const argsStockLotsV2Controller_updateStockLot: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateStockLotRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/stock-lots/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller.prototype.updateStockLot)),

            async function StockLotsV2Controller_updateStockLot(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStockLotsV2Controller_updateStockLot, request, response });

                const controller = new StockLotsV2Controller();

              await templateService.apiHandler({
                methodName: 'updateStockLot',
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
        const argsStockLotsV2Controller_bulkUpdateStockLots: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"BulkUpdateStockLotsRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/stock-lots/bulk-update',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller.prototype.bulkUpdateStockLots)),

            async function StockLotsV2Controller_bulkUpdateStockLots(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStockLotsV2Controller_bulkUpdateStockLots, request, response });

                const controller = new StockLotsV2Controller();

              await templateService.apiHandler({
                methodName: 'bulkUpdateStockLots',
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
        const argsStockLotsV2Controller_deleteStockLot: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/stock-lots/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(StockLotsV2Controller.prototype.deleteStockLot)),

            async function StockLotsV2Controller_deleteStockLot(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsStockLotsV2Controller_deleteStockLot, request, response });

                const controller = new StockLotsV2Controller();

              await templateService.apiHandler({
                methodName: 'deleteStockLot',
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
        const argsOrdersV2Controller_createOrder: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateOrderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/orders',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller.prototype.createOrder)),

            async function OrdersV2Controller_createOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersV2Controller_createOrder, request, response });

                const controller = new OrdersV2Controller();

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
        const argsOrdersV2Controller_getOrderDetail: Record<string, TsoaRoute.ParameterSchema> = {
                orderId: {"in":"path","name":"orderId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/orders/:orderId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller.prototype.getOrderDetail)),

            async function OrdersV2Controller_getOrderDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersV2Controller_getOrderDetail, request, response });

                const controller = new OrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'getOrderDetail',
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
        const argsOrdersV2Controller_getOrders: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["pending"]},{"dataType":"enum","enums":["completed"]},{"dataType":"enum","enums":["cancelled"]}]},
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["buyer"]},{"dataType":"enum","enums":["seller"]}]},
                quality_tier_min: {"in":"query","name":"quality_tier_min","dataType":"double"},
                quality_tier_max: {"in":"query","name":"quality_tier_max","dataType":"double"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["total_price"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/orders',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(OrdersV2Controller.prototype.getOrders)),

            async function OrdersV2Controller_getOrders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOrdersV2Controller_getOrders, request, response });

                const controller = new OrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'getOrders',
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
        const argsOffersV2Controller_getOfferSession: Record<string, TsoaRoute.ParameterSchema> = {
                sessionId: {"in":"path","name":"sessionId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/offers/:sessionId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(OffersV2Controller.prototype.getOfferSession)),

            async function OffersV2Controller_getOfferSession(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersV2Controller_getOfferSession, request, response });

                const controller = new OffersV2Controller();

              await templateService.apiHandler({
                methodName: 'getOfferSession',
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
        const argsOffersV2Controller_searchOffers: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["customer"]},{"dataType":"enum","enums":["seller"]}]},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["closed"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/offers/search',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(OffersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(OffersV2Controller.prototype.searchOffers)),

            async function OffersV2Controller_searchOffers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsOffersV2Controller_searchOffers, request, response });

                const controller = new OffersV2Controller();

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
        const argsListingsV2Controller_createListing: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateListingRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.createListing)),

            async function ListingsV2Controller_createListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_createListing, request, response });

                const controller = new ListingsV2Controller();

              await templateService.apiHandler({
                methodName: 'createListing',
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
        const argsListingsV2Controller_searchListings: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                game_item_id: {"in":"query","name":"game_item_id","dataType":"string"},
                quality_tier_min: {"in":"query","name":"quality_tier_min","dataType":"double"},
                quality_tier_max: {"in":"query","name":"quality_tier_max","dataType":"double"},
                price_min: {"in":"query","name":"price_min","dataType":"double"},
                price_max: {"in":"query","name":"price_max","dataType":"double"},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                item_type: {"in":"query","name":"item_type","dataType":"string"},
                quantity_min: {"in":"query","name":"quantity_min","dataType":"double"},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quality"]},{"dataType":"enum","enums":["seller_rating"]},{"dataType":"enum","enums":["quantity"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                language_codes: {"in":"query","name":"language_codes","dataType":"string"},
                listing_type: {"in":"query","name":"listing_type","dataType":"union","subSchemas":[{"dataType":"enum","enums":["single"]},{"dataType":"enum","enums":["bundle"]},{"dataType":"enum","enums":["bulk"]}]},
                seller_username: {"in":"query","name":"seller_username","dataType":"string"},
                contractor_spectrum_id: {"in":"query","name":"contractor_spectrum_id","dataType":"string"},
        };
        app.get('/listings/search',
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.searchListings)),

            async function ListingsV2Controller_searchListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_searchListings, request, response });

                const controller = new ListingsV2Controller();

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
        const argsListingsV2Controller_getMyListings: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quantity"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                spectrum_id: {"in":"query","name":"spectrum_id","dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/listings/mine',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.getMyListings)),

            async function ListingsV2Controller_getMyListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_getMyListings, request, response });

                const controller = new ListingsV2Controller();

              await templateService.apiHandler({
                methodName: 'getMyListings',
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
        const argsListingsV2Controller_getListingDetail: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/listings/:id',
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.getListingDetail)),

            async function ListingsV2Controller_getListingDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_getListingDetail, request, response });

                const controller = new ListingsV2Controller();

              await templateService.apiHandler({
                methodName: 'getListingDetail',
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
        const argsListingsV2Controller_updateListing: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateListingRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/listings/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.updateListing)),

            async function ListingsV2Controller_updateListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_updateListing, request, response });

                const controller = new ListingsV2Controller();

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
        const argsListingsV2Controller_refreshListing: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings/:id/refresh',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.refreshListing)),

            async function ListingsV2Controller_refreshListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_refreshListing, request, response });

                const controller = new ListingsV2Controller();

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
        const argsListingsV2Controller_deleteListing: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/listings/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.deleteListing)),

            async function ListingsV2Controller_deleteListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_deleteListing, request, response });

                const controller = new ListingsV2Controller();

              await templateService.apiHandler({
                methodName: 'deleteListing',
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
        const argsListingsV2Controller_trackView: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings/:id/views',
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.trackView)),

            async function ListingsV2Controller_trackView(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_trackView, request, response });

                const controller = new ListingsV2Controller();

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
        const argsListingsV2Controller_uploadPhotos: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings/:id/photos',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ListingsV2Controller.prototype.uploadPhotos)),

            async function ListingsV2Controller_uploadPhotos(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsListingsV2Controller_uploadPhotos, request, response });

                const controller = new ListingsV2Controller();

              await templateService.apiHandler({
                methodName: 'uploadPhotos',
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
        const argsImportJobsV2Controller_startImport: Record<string, TsoaRoute.ParameterSchema> = {
                source: {"in":"path","name":"source","required":true,"ref":"ImportSource"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/admin/imports/:source',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller.prototype.startImport)),

            async function ImportJobsV2Controller_startImport(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsImportJobsV2Controller_startImport, request, response });

                const controller = new ImportJobsV2Controller();

              await templateService.apiHandler({
                methodName: 'startImport',
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
        const argsImportJobsV2Controller_getJobStatus: Record<string, TsoaRoute.ParameterSchema> = {
                jobId: {"in":"path","name":"jobId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/imports/:jobId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller.prototype.getJobStatus)),

            async function ImportJobsV2Controller_getJobStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsImportJobsV2Controller_getJobStatus, request, response });

                const controller = new ImportJobsV2Controller();

              await templateService.apiHandler({
                methodName: 'getJobStatus',
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
        const argsImportJobsV2Controller_listJobs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/imports',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(ImportJobsV2Controller.prototype.listJobs)),

            async function ImportJobsV2Controller_listJobs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsImportJobsV2Controller_listJobs, request, response });

                const controller = new ImportJobsV2Controller();

              await templateService.apiHandler({
                methodName: 'listJobs',
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
        app.get('/health',
            ...(fetchMiddlewares<RequestHandler>(HealthController)),
            ...(fetchMiddlewares<RequestHandler>(HealthController.prototype.getHealth)),

            async function HealthController_getHealth(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHealthController_getHealth, request, response });

                const controller = new HealthController();

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
        const argsGameItemsV2Controller_searchGameItems: Record<string, TsoaRoute.ParameterSchema> = {
                query: {"in":"query","name":"query","dataType":"string"},
        };
        app.get('/game-items/search',
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller.prototype.searchGameItems)),

            async function GameItemsV2Controller_searchGameItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsGameItemsV2Controller_searchGameItems, request, response });

                const controller = new GameItemsV2Controller();

              await templateService.apiHandler({
                methodName: 'searchGameItems',
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
        const argsGameItemsV2Controller_getCategories: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-items/categories',
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller.prototype.getCategories)),

            async function GameItemsV2Controller_getCategories(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsGameItemsV2Controller_getCategories, request, response });

                const controller = new GameItemsV2Controller();

              await templateService.apiHandler({
                methodName: 'getCategories',
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
        const argsGameItemsV2Controller_getListings: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                quality_tier: {"in":"query","name":"quality_tier","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quality"]},{"dataType":"enum","enums":["quantity"]},{"dataType":"enum","enums":["seller_rating"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-items/:id/listings',
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller.prototype.getListings)),

            async function GameItemsV2Controller_getListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsGameItemsV2Controller_getListings, request, response });

                const controller = new GameItemsV2Controller();

              await templateService.apiHandler({
                methodName: 'getListings',
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
        const argsGameItemsV2Controller_searchGameItemAggregates: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                item_type: {"in":"query","name":"item_type","dataType":"string"},
                price_min: {"in":"query","name":"price_min","dataType":"double"},
                price_max: {"in":"query","name":"price_max","dataType":"double"},
                quantity_min: {"in":"query","name":"quantity_min","dataType":"double"},
                quantity_max: {"in":"query","name":"quantity_max","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quantity"]},{"dataType":"enum","enums":["name"]},{"dataType":"enum","enums":["seller_count"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-items/aggregates',
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(GameItemsV2Controller.prototype.searchGameItemAggregates)),

            async function GameItemsV2Controller_searchGameItemAggregates(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsGameItemsV2Controller_searchGameItemAggregates, request, response });

                const controller = new GameItemsV2Controller();

              await templateService.apiHandler({
                methodName: 'searchGameItemAggregates',
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
        const argsWishlistsController_getWishlists: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/wishlists',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.getWishlists)),

            async function WishlistsController_getWishlists(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_getWishlists, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'getWishlists',
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
        const argsWishlistsController_createWishlist: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CreateWishlistRequest"},
        };
        app.post('/game-data/wishlists',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.createWishlist)),

            async function WishlistsController_createWishlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_createWishlist, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'createWishlist',
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
        const argsWishlistsController_getWishlist: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
                share_token: {"in":"query","name":"share_token","dataType":"string"},
        };
        app.get('/game-data/wishlists/:wishlist_id',
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.getWishlist)),

            async function WishlistsController_getWishlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_getWishlist, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'getWishlist',
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
        const argsWishlistsController_updateWishlist: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"UpdateWishlistRequest"},
        };
        app.put('/game-data/wishlists/:wishlist_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.updateWishlist)),

            async function WishlistsController_updateWishlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_updateWishlist, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'updateWishlist',
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
        const argsWishlistsController_deleteWishlist: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
        };
        app.delete('/game-data/wishlists/:wishlist_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.deleteWishlist)),

            async function WishlistsController_deleteWishlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_deleteWishlist, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'deleteWishlist',
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
        const argsWishlistsController_addWishlistItem: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"AddWishlistItemRequest"},
        };
        app.post('/game-data/wishlists/:wishlist_id/items',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.addWishlistItem)),

            async function WishlistsController_addWishlistItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_addWishlistItem, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'addWishlistItem',
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
        const argsWishlistsController_removeWishlistItem: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
                item_id: {"in":"path","name":"item_id","required":true,"dataType":"string"},
        };
        app.delete('/game-data/wishlists/:wishlist_id/items/:item_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.removeWishlistItem)),

            async function WishlistsController_removeWishlistItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_removeWishlistItem, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'removeWishlistItem',
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
        const argsWishlistsController_updateWishlistItem: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
                item_id: {"in":"path","name":"item_id","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"UpdateWishlistItemRequest"},
        };
        app.put('/game-data/wishlists/:wishlist_id/items/:item_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.updateWishlistItem)),

            async function WishlistsController_updateWishlistItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_updateWishlistItem, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'updateWishlistItem',
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
        const argsWishlistsController_generateShoppingList: Record<string, TsoaRoute.ParameterSchema> = {
                wishlist_id: {"in":"path","name":"wishlist_id","required":true,"dataType":"string"},
        };
        app.get('/game-data/wishlists/:wishlist_id/shopping-list',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController)),
            ...(fetchMiddlewares<RequestHandler>(WishlistsController.prototype.generateShoppingList)),

            async function WishlistsController_generateShoppingList(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWishlistsController_generateShoppingList, request, response });

                const controller = new WishlistsController();

              await templateService.apiHandler({
                methodName: 'generateShoppingList',
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
        const argsWikiController_searchItems: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                type: {"in":"query","name":"type","dataType":"string"},
                sub_type: {"in":"query","name":"sub_type","dataType":"string"},
                size: {"in":"query","name":"size","dataType":"string"},
                grade: {"in":"query","name":"grade","dataType":"string"},
                manufacturer: {"in":"query","name":"manufacturer","dataType":"string"},
                category: {"in":"query","name":"category","dataType":"string"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/wiki/items',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.searchItems)),

            async function WikiController_searchItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_searchItems, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'searchItems',
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
        const argsWikiController_getItemDetail: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/game-data/wiki/items/:id',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getItemDetail)),

            async function WikiController_getItemDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getItemDetail, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getItemDetail',
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
        const argsWikiController_getShips: Record<string, TsoaRoute.ParameterSchema> = {
                manufacturer: {"in":"query","name":"manufacturer","dataType":"string"},
                focus: {"in":"query","name":"focus","dataType":"string"},
                size: {"in":"query","name":"size","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/wiki/ships',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getShips)),

            async function WikiController_getShips(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getShips, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getShips',
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
        const argsWikiController_getShipDetail: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/game-data/wiki/ships/:id',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getShipDetail)),

            async function WikiController_getShipDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getShipDetail, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getShipDetail',
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
        const argsWikiController_getCommodities: Record<string, TsoaRoute.ParameterSchema> = {
                category: {"in":"query","name":"category","dataType":"string"},
                can_be_mined: {"in":"query","name":"can_be_mined","dataType":"boolean"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/wiki/commodities',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getCommodities)),

            async function WikiController_getCommodities(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getCommodities, request, response });

                const controller = new WikiController();

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
        const argsWikiController_getLocations: Record<string, TsoaRoute.ParameterSchema> = {
                parent_id: {"in":"query","name":"parent_id","dataType":"string"},
        };
        app.get('/game-data/wiki/locations',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getLocations)),

            async function WikiController_getLocations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getLocations, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getLocations',
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
        const argsWikiController_getManufacturers: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/wiki/manufacturers',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getManufacturers)),

            async function WikiController_getManufacturers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getManufacturers, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getManufacturers',
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
        const argsWikiController_getManufacturerDetail: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.get('/game-data/wiki/manufacturers/:id',
            ...(fetchMiddlewares<RequestHandler>(WikiController)),
            ...(fetchMiddlewares<RequestHandler>(WikiController.prototype.getManufacturerDetail)),

            async function WikiController_getManufacturerDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWikiController_getManufacturerDetail, request, response });

                const controller = new WikiController();

              await templateService.apiHandler({
                methodName: 'getManufacturerDetail',
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
        const argsVersionsController_listVersions: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/versions',
            ...(fetchMiddlewares<RequestHandler>(VersionsController)),
            ...(fetchMiddlewares<RequestHandler>(VersionsController.prototype.listVersions)),

            async function VersionsController_listVersions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVersionsController_listVersions, request, response });

                const controller = new VersionsController();

              await templateService.apiHandler({
                methodName: 'listVersions',
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
        const argsVersionsController_getActiveVersions: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/versions/active',
            ...(fetchMiddlewares<RequestHandler>(VersionsController)),
            ...(fetchMiddlewares<RequestHandler>(VersionsController.prototype.getActiveVersions)),

            async function VersionsController_getActiveVersions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVersionsController_getActiveVersions, request, response });

                const controller = new VersionsController();

              await templateService.apiHandler({
                methodName: 'getActiveVersions',
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
        const argsVersionsController_selectVersion: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"SelectVersionRequest"},
        };
        app.post('/game-data/versions/select',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(VersionsController)),
            ...(fetchMiddlewares<RequestHandler>(VersionsController.prototype.selectVersion)),

            async function VersionsController_selectVersion(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVersionsController_selectVersion, request, response });

                const controller = new VersionsController();

              await templateService.apiHandler({
                methodName: 'selectVersion',
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
        const argsResourcesController_searchResources: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                resource_category: {"in":"query","name":"resource_category","dataType":"string"},
                resource_subcategory: {"in":"query","name":"resource_subcategory","dataType":"string"},
                acquisition_method: {"in":"query","name":"acquisition_method","dataType":"union","subSchemas":[{"dataType":"enum","enums":["mined"]},{"dataType":"enum","enums":["purchased"]},{"dataType":"enum","enums":["salvaged"]},{"dataType":"enum","enums":["looted"]}]},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/resources/search',
            ...(fetchMiddlewares<RequestHandler>(ResourcesController)),
            ...(fetchMiddlewares<RequestHandler>(ResourcesController.prototype.searchResources)),

            async function ResourcesController_searchResources(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsResourcesController_searchResources, request, response });

                const controller = new ResourcesController();

              await templateService.apiHandler({
                methodName: 'searchResources',
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
        const argsResourcesController_getResource: Record<string, TsoaRoute.ParameterSchema> = {
                resource_id: {"in":"path","name":"resource_id","required":true,"dataType":"string"},
        };
        app.get('/game-data/resources/:resource_id',
            ...(fetchMiddlewares<RequestHandler>(ResourcesController)),
            ...(fetchMiddlewares<RequestHandler>(ResourcesController.prototype.getResource)),

            async function ResourcesController_getResource(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsResourcesController_getResource, request, response });

                const controller = new ResourcesController();

              await templateService.apiHandler({
                methodName: 'getResource',
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
        const argsResourcesController_getResourceCategories: Record<string, TsoaRoute.ParameterSchema> = {
                version_id: {"in":"query","name":"version_id","dataType":"string"},
        };
        app.get('/game-data/resources/categories',
            ...(fetchMiddlewares<RequestHandler>(ResourcesController)),
            ...(fetchMiddlewares<RequestHandler>(ResourcesController.prototype.getResourceCategories)),

            async function ResourcesController_getResourceCategories(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsResourcesController_getResourceCategories, request, response });

                const controller = new ResourcesController();

              await templateService.apiHandler({
                methodName: 'getResourceCategories',
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
        const argsMissionsController_searchMissions: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                category: {"in":"query","name":"category","dataType":"string"},
                career_type: {"in":"query","name":"career_type","dataType":"string"},
                star_system: {"in":"query","name":"star_system","dataType":"string"},
                planet_moon: {"in":"query","name":"planet_moon","dataType":"string"},
                faction: {"in":"query","name":"faction","dataType":"string"},
                mission_giver_org: {"in":"query","name":"mission_giver_org","dataType":"string"},
                legal_status: {"in":"query","name":"legal_status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["LEGAL"]},{"dataType":"enum","enums":["ILLEGAL"]}]},
                difficulty_min: {"in":"query","name":"difficulty_min","dataType":"double"},
                difficulty_max: {"in":"query","name":"difficulty_max","dataType":"double"},
                is_shareable: {"in":"query","name":"is_shareable","dataType":"boolean"},
                availability_type: {"in":"query","name":"availability_type","dataType":"string"},
                associated_event: {"in":"query","name":"associated_event","dataType":"string"},
                is_chain_starter: {"in":"query","name":"is_chain_starter","dataType":"boolean"},
                has_blueprint_rewards: {"in":"query","name":"has_blueprint_rewards","dataType":"boolean"},
                credit_reward_min: {"in":"query","name":"credit_reward_min","dataType":"double"},
                community_difficulty_min: {"in":"query","name":"community_difficulty_min","dataType":"double"},
                community_satisfaction_min: {"in":"query","name":"community_satisfaction_min","dataType":"double"},
                event_code: {"in":"query","name":"event_code","dataType":"string"},
                exclude_events: {"in":"query","name":"exclude_events","dataType":"boolean"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/missions/search',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.searchMissions)),

            async function MissionsController_searchMissions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_searchMissions, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'searchMissions',
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
        const argsMissionsController_getMissionDetail: Record<string, TsoaRoute.ParameterSchema> = {
                mission_id: {"in":"path","name":"mission_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/game-data/missions/:mission_id',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getMissionDetail)),

            async function MissionsController_getMissionDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getMissionDetail, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getMissionDetail',
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
        const argsMissionsController_getMissionDetailByCode: Record<string, TsoaRoute.ParameterSchema> = {
                mission_code: {"in":"path","name":"mission_code","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/game-data/missions/by-code/:mission_code',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getMissionDetailByCode)),

            async function MissionsController_getMissionDetailByCode(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getMissionDetailByCode, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getMissionDetailByCode',
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
        const argsMissionsController_getMissionBlueprints: Record<string, TsoaRoute.ParameterSchema> = {
                mission_id: {"in":"path","name":"mission_id","required":true,"dataType":"string"},
        };
        app.get('/game-data/missions/:mission_id/blueprints',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getMissionBlueprints)),

            async function MissionsController_getMissionBlueprints(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getMissionBlueprints, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getMissionBlueprints',
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
        const argsMissionsController_completeMission: Record<string, TsoaRoute.ParameterSchema> = {
                mission_id: {"in":"path","name":"mission_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"completion_notes":{"dataType":"string"},"blueprints_rewarded":{"dataType":"array","array":{"dataType":"string"}}}},
        };
        app.post('/game-data/missions/:mission_id/complete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.completeMission)),

            async function MissionsController_completeMission(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_completeMission, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'completeMission',
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
        const argsMissionsController_rateMission: Record<string, TsoaRoute.ParameterSchema> = {
                mission_id: {"in":"path","name":"mission_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"rating_comment":{"dataType":"string"},"satisfaction_rating":{"dataType":"double","required":true},"difficulty_rating":{"dataType":"double","required":true}}},
        };
        app.post('/game-data/missions/:mission_id/rate',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.rateMission)),

            async function MissionsController_rateMission(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_rateMission, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'rateMission',
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
        const argsMissionsController_getMissionChains: Record<string, TsoaRoute.ParameterSchema> = {
                version_id: {"in":"query","name":"version_id","dataType":"string"},
        };
        app.get('/game-data/missions/chains',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getMissionChains)),

            async function MissionsController_getMissionChains(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getMissionChains, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getMissionChains',
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
        const argsMissionsController_getReputationRanks: Record<string, TsoaRoute.ParameterSchema> = {
                scope_code: {"in":"query","name":"scope_code","dataType":"string"},
        };
        app.get('/game-data/missions/reputation-ranks',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getReputationRanks)),

            async function MissionsController_getReputationRanks(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getReputationRanks, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getReputationRanks',
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
        const argsMissionsController_getGameEvents: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/missions/events',
            ...(fetchMiddlewares<RequestHandler>(MissionsController)),
            ...(fetchMiddlewares<RequestHandler>(MissionsController.prototype.getGameEvents)),

            async function MissionsController_getGameEvents(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMissionsController_getGameEvents, request, response });

                const controller = new MissionsController();

              await templateService.apiHandler({
                methodName: 'getGameEvents',
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
        const argsCraftingController_calculateQuality: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CalculateQualityRequest"},
        };
        app.post('/game-data/crafting/calculate-quality',
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.calculateQuality)),

            async function CraftingController_calculateQuality(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_calculateQuality, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'calculateQuality',
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
        const argsCraftingController_simulateCrafting: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"SimulateCraftingRequest"},
        };
        app.post('/game-data/crafting/simulate',
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.simulateCrafting)),

            async function CraftingController_simulateCrafting(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_simulateCrafting, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'simulateCrafting',
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
        const argsCraftingController_recordCrafting: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"RecordCraftingRequest"},
        };
        app.post('/game-data/crafting/craft',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.recordCrafting)),

            async function CraftingController_recordCrafting(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_recordCrafting, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'recordCrafting',
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
        const argsCraftingController_getCraftingHistory: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"query","name":"blueprint_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/crafting/history',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.getCraftingHistory)),

            async function CraftingController_getCraftingHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_getCraftingHistory, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'getCraftingHistory',
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
        const argsCraftingController_getCraftableItems: Record<string, TsoaRoute.ParameterSchema> = {
                item_category: {"in":"query","name":"item_category","dataType":"string"},
                rarity: {"in":"query","name":"rarity","dataType":"string"},
                tier: {"in":"query","name":"tier","dataType":"double"},
                craftable_only: {"in":"query","name":"craftable_only","dataType":"boolean"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/crafting/craftable-items',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.getCraftableItems)),

            async function CraftingController_getCraftableItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_getCraftableItems, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'getCraftableItems',
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
        const argsCraftingController_getCraftingStatistics: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/game-data/crafting/statistics',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CraftingController)),
            ...(fetchMiddlewares<RequestHandler>(CraftingController.prototype.getCraftingStatistics)),

            async function CraftingController_getCraftingStatistics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCraftingController_getCraftingStatistics, request, response });

                const controller = new CraftingController();

              await templateService.apiHandler({
                methodName: 'getCraftingStatistics',
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
        const argsBlueprintsController_searchBlueprints: Record<string, TsoaRoute.ParameterSchema> = {
                text: {"in":"query","name":"text","dataType":"string"},
                item_category: {"in":"query","name":"item_category","dataType":"string"},
                item_subcategory: {"in":"query","name":"item_subcategory","dataType":"string"},
                rarity: {"in":"query","name":"rarity","dataType":"string"},
                tier: {"in":"query","name":"tier","dataType":"double"},
                crafting_station_type: {"in":"query","name":"crafting_station_type","dataType":"string"},
                output_game_item_id: {"in":"query","name":"output_game_item_id","dataType":"string"},
                user_owned_only: {"in":"query","name":"user_owned_only","dataType":"boolean"},
                source: {"in":"query","name":"source","dataType":"string"},
                manufacturer: {"in":"query","name":"manufacturer","dataType":"string"},
                ingredient_name: {"in":"query","name":"ingredient_name","dataType":"string"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/game-data/blueprints/search',
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.searchBlueprints)),

            async function BlueprintsController_searchBlueprints(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_searchBlueprints, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'searchBlueprints',
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
        const argsBlueprintsController_getBlueprintDetail: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"path","name":"blueprint_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/game-data/blueprints/:blueprint_id',
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getBlueprintDetail)),

            async function BlueprintsController_getBlueprintDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getBlueprintDetail, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getBlueprintDetail',
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
        const argsBlueprintsController_getBlueprintDetailByCode: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_code: {"in":"path","name":"blueprint_code","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/game-data/blueprints/by-code/:blueprint_code',
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getBlueprintDetailByCode)),

            async function BlueprintsController_getBlueprintDetailByCode(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getBlueprintDetailByCode, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getBlueprintDetailByCode',
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
        const argsBlueprintsController_getBlueprintMissions: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"path","name":"blueprint_id","required":true,"dataType":"string"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
        };
        app.get('/game-data/blueprints/:blueprint_id/missions',
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getBlueprintMissions)),

            async function BlueprintsController_getBlueprintMissions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getBlueprintMissions, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getBlueprintMissions',
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
        const argsBlueprintsController_addBlueprintToInventory: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"path","name":"blueprint_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"acquisition_notes":{"dataType":"string"},"acquisition_location":{"dataType":"string"},"acquisition_method":{"dataType":"string"}}},
        };
        app.post('/game-data/blueprints/:blueprint_id/inventory',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.addBlueprintToInventory)),

            async function BlueprintsController_addBlueprintToInventory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_addBlueprintToInventory, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'addBlueprintToInventory',
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
        const argsBlueprintsController_removeBlueprintFromInventory: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"path","name":"blueprint_id","required":true,"dataType":"string"},
        };
        app.delete('/game-data/blueprints/:blueprint_id/inventory',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.removeBlueprintFromInventory)),

            async function BlueprintsController_removeBlueprintFromInventory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_removeBlueprintFromInventory, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'removeBlueprintFromInventory',
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
        const argsBlueprintsController_getBlueprintCategories: Record<string, TsoaRoute.ParameterSchema> = {
                version_id: {"in":"query","name":"version_id","dataType":"string"},
        };
        app.get('/game-data/blueprints/categories',
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getBlueprintCategories)),

            async function BlueprintsController_getBlueprintCategories(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getBlueprintCategories, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getBlueprintCategories',
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
        const argsBlueprintsController_getUserBlueprintInventory: Record<string, TsoaRoute.ParameterSchema> = {
                item_category: {"in":"query","name":"item_category","dataType":"string"},
                rarity: {"in":"query","name":"rarity","dataType":"string"},
                version_id: {"in":"query","name":"version_id","dataType":"string"},
                sort_by: {"default":"acquisition_date","in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["acquisition_date"]},{"dataType":"enum","enums":["blueprint_name"]}]},
                sort_order: {"default":"desc","in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":50,"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/game-data/blueprints/inventory',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getUserBlueprintInventory)),

            async function BlueprintsController_getUserBlueprintInventory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getUserBlueprintInventory, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getUserBlueprintInventory',
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
        const argsBlueprintsController_getOrgBlueprintOwners: Record<string, TsoaRoute.ParameterSchema> = {
                blueprint_id: {"in":"path","name":"blueprint_id","required":true,"dataType":"string"},
                spectrum_id: {"in":"path","name":"spectrum_id","required":true,"dataType":"string"},
        };
        app.get('/game-data/blueprints/:blueprint_id/org-owners/:spectrum_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController)),
            ...(fetchMiddlewares<RequestHandler>(BlueprintsController.prototype.getOrgBlueprintOwners)),

            async function BlueprintsController_getOrgBlueprintOwners(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBlueprintsController_getOrgBlueprintOwners, request, response });

                const controller = new BlueprintsController();

              await templateService.apiHandler({
                methodName: 'getOrgBlueprintOwners',
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
        const argsDebugV2Controller_getFeatureFlag: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/debug/feature-flag',
            ...(fetchMiddlewares<RequestHandler>(DebugV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(DebugV2Controller.prototype.getFeatureFlag)),

            async function DebugV2Controller_getFeatureFlag(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDebugV2Controller_getFeatureFlag, request, response });

                const controller = new DebugV2Controller();

              await templateService.apiHandler({
                methodName: 'getFeatureFlag',
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
        const argsDebugV2Controller_setFeatureFlag: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"SetFeatureFlagRequest"},
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
        };
        app.post('/debug/feature-flag',
            authenticateMiddleware([{"jwt":[]},{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(DebugV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(DebugV2Controller.prototype.setFeatureFlag)),

            async function DebugV2Controller_setFeatureFlag(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDebugV2Controller_setFeatureFlag, request, response });

                const controller = new DebugV2Controller();

              await templateService.apiHandler({
                methodName: 'setFeatureFlag',
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
        const argsCartV2Controller_getCart: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/cart',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.getCart)),

            async function CartV2Controller_getCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_getCart, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'getCart',
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
        const argsCartV2Controller_addToCart: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"AddToCartRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/cart/add',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.addToCart)),

            async function CartV2Controller_addToCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_addToCart, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'addToCart',
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
        const argsCartV2Controller_updateCartItem: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateCartItemRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/cart/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.updateCartItem)),

            async function CartV2Controller_updateCartItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_updateCartItem, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'updateCartItem',
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
        const argsCartV2Controller_removeCartItem: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/cart/:id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.removeCartItem)),

            async function CartV2Controller_removeCartItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_removeCartItem, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'removeCartItem',
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
        const argsCartV2Controller_checkoutCart: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CheckoutCartRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/cart/checkout',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.checkoutCart)),

            async function CartV2Controller_checkoutCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_checkoutCart, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'checkoutCart',
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
        const argsBuyOrdersV2Controller_createPurchase: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateBuyOrderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/buy-orders',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.createPurchase)),

            async function BuyOrdersV2Controller_createPurchase(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_createPurchase, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'createPurchase',
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
        const argsBuyOrdersV2Controller_createStandingBuyOrder: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateStandingBuyOrderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/buy-orders/standing',
            authenticateMiddleware([{"jwt":[]},{"session":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.createStandingBuyOrder)),

            async function BuyOrdersV2Controller_createStandingBuyOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_createStandingBuyOrder, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'createStandingBuyOrder',
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
        const argsBuyOrdersV2Controller_searchBuyOrders: Record<string, TsoaRoute.ParameterSchema> = {
                game_item_id: {"in":"query","name":"game_item_id","dataType":"string"},
                quality_tier_min: {"in":"query","name":"quality_tier_min","dataType":"double"},
                quality_tier_max: {"in":"query","name":"quality_tier_max","dataType":"double"},
                quality_value_min: {"in":"query","name":"quality_value_min","dataType":"double"},
                quality_value_max: {"in":"query","name":"quality_value_max","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"string"},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/buy-orders/search',
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.searchBuyOrders)),

            async function BuyOrdersV2Controller_searchBuyOrders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_searchBuyOrders, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'searchBuyOrders',
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
        const argsBuyOrdersV2Controller_getMyBuyOrders: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["fulfilled"]},{"dataType":"enum","enums":["cancelled"]},{"dataType":"enum","enums":["expired"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
        };
        app.get('/buy-orders/mine',
            authenticateMiddleware([{"jwt":[]},{"session":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.getMyBuyOrders)),

            async function BuyOrdersV2Controller_getMyBuyOrders(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_getMyBuyOrders, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'getMyBuyOrders',
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
        const argsBuyOrdersV2Controller_updateBuyOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateStandingBuyOrderRequest"},
        };
        app.put('/buy-orders/:id',
            authenticateMiddleware([{"jwt":[]},{"session":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.updateBuyOrder)),

            async function BuyOrdersV2Controller_updateBuyOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_updateBuyOrder, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'updateBuyOrder',
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
        const argsBuyOrdersV2Controller_cancelBuyOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/buy-orders/:id',
            authenticateMiddleware([{"jwt":[]},{"session":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.cancelBuyOrder)),

            async function BuyOrdersV2Controller_cancelBuyOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_cancelBuyOrder, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'cancelBuyOrder',
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
        const argsBuyOrdersV2Controller_fulfillBuyOrder: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"variant_id":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}}},
        };
        app.post('/buy-orders/:id/fulfill',
            authenticateMiddleware([{"jwt":[]},{"session":[]}]),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.fulfillBuyOrder)),

            async function BuyOrdersV2Controller_fulfillBuyOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_fulfillBuyOrder, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'fulfillBuyOrder',
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
        const argsAvailabilityV2Controller_getNextAvailable: Record<string, TsoaRoute.ParameterSchema> = {
                username: {"in":"query","name":"username","dataType":"string"},
                spectrum_id: {"in":"query","name":"spectrum_id","dataType":"string"},
        };
        app.get('/availability/next',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AvailabilityV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(AvailabilityV2Controller.prototype.getNextAvailable)),

            async function AvailabilityV2Controller_getNextAvailable(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAvailabilityV2Controller_getNextAvailable, request, response });

                const controller = new AvailabilityV2Controller();

              await templateService.apiHandler({
                methodName: 'getNextAvailable',
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
        const argsAnalyticsV2Controller_getPriceHistory: Record<string, TsoaRoute.ParameterSchema> = {
                game_item_id: {"in":"query","name":"game_item_id","required":true,"dataType":"string"},
                quality_tier: {"in":"query","name":"quality_tier","dataType":"double"},
                start_date: {"in":"query","name":"start_date","dataType":"string"},
                end_date: {"in":"query","name":"end_date","dataType":"string"},
                interval: {"in":"query","name":"interval","dataType":"union","subSchemas":[{"dataType":"enum","enums":["hour"]},{"dataType":"enum","enums":["day"]},{"dataType":"enum","enums":["week"]},{"dataType":"enum","enums":["month"]}]},
        };
        app.get('/analytics/price-history',
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller.prototype.getPriceHistory)),

            async function AnalyticsV2Controller_getPriceHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAnalyticsV2Controller_getPriceHistory, request, response });

                const controller = new AnalyticsV2Controller();

              await templateService.apiHandler({
                methodName: 'getPriceHistory',
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
        const argsAnalyticsV2Controller_getQualityDistribution: Record<string, TsoaRoute.ParameterSchema> = {
                game_item_id: {"in":"query","name":"game_item_id","required":true,"dataType":"string"},
                start_date: {"in":"query","name":"start_date","dataType":"string"},
                end_date: {"in":"query","name":"end_date","dataType":"string"},
        };
        app.get('/analytics/quality-distribution',
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller.prototype.getQualityDistribution)),

            async function AnalyticsV2Controller_getQualityDistribution(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAnalyticsV2Controller_getQualityDistribution, request, response });

                const controller = new AnalyticsV2Controller();

              await templateService.apiHandler({
                methodName: 'getQualityDistribution',
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
        const argsAnalyticsV2Controller_getSellerStats: Record<string, TsoaRoute.ParameterSchema> = {
                seller_id: {"in":"query","name":"seller_id","dataType":"string"},
        };
        app.get('/analytics/seller-stats',
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(AnalyticsV2Controller.prototype.getSellerStats)),

            async function AnalyticsV2Controller_getSellerStats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAnalyticsV2Controller_getSellerStats, request, response });

                const controller = new AnalyticsV2Controller();

              await templateService.apiHandler({
                methodName: 'getSellerStats',
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
        const argsFeatureFlagAdminController_getConfig: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/feature-flags/config',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.getConfig)),

            async function FeatureFlagAdminController_getConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_getConfig, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'getConfig',
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
        const argsFeatureFlagAdminController_updateConfig: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateConfigRequest"},
        };
        app.put('/admin/feature-flags/config',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.updateConfig)),

            async function FeatureFlagAdminController_updateConfig(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_updateConfig, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'updateConfig',
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
        const argsFeatureFlagAdminController_getStats: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/feature-flags/stats',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.getStats)),

            async function FeatureFlagAdminController_getStats(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_getStats, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'getStats',
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
        const argsFeatureFlagAdminController_getUserOverrides: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"in":"query","name":"page","dataType":"double"},
                pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                search: {"in":"query","name":"search","dataType":"string"},
        };
        app.get('/admin/feature-flags/overrides',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.getUserOverrides)),

            async function FeatureFlagAdminController_getUserOverrides(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_getUserOverrides, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'getUserOverrides',
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
        const argsFeatureFlagAdminController_setUserOverride: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"SetUserOverrideRequest"},
        };
        app.post('/admin/feature-flags/overrides',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.setUserOverride)),

            async function FeatureFlagAdminController_setUserOverride(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_setUserOverride, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'setUserOverride',
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
        const argsFeatureFlagAdminController_removeUserOverride: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                username: {"in":"path","name":"username","required":true,"dataType":"string"},
        };
        app.delete('/admin/feature-flags/overrides/:username',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController)),
            ...(fetchMiddlewares<RequestHandler>(FeatureFlagAdminController.prototype.removeUserOverride)),

            async function FeatureFlagAdminController_removeUserOverride(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFeatureFlagAdminController_removeUserOverride, request, response });

                const controller = new FeatureFlagAdminController();

              await templateService.apiHandler({
                methodName: 'removeUserOverride',
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
        const argsAdminController_importGameData: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/admin/import-game-data',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.importGameData)),

            async function AdminController_importGameData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_importGameData, request, response });

                const controller = new AdminController();

              await templateService.apiHandler({
                methodName: 'importGameData',
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
        const argsAdminController_listGameDataImportJobs: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/import-game-data',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.listGameDataImportJobs)),

            async function AdminController_listGameDataImportJobs(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_listGameDataImportJobs, request, response });

                const controller = new AdminController();

              await templateService.apiHandler({
                methodName: 'listGameDataImportJobs',
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
        const argsAdminController_getImportJobStatus: Record<string, TsoaRoute.ParameterSchema> = {
                jobId: {"in":"path","name":"jobId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/admin/import-game-data/:jobId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AdminController)),
            ...(fetchMiddlewares<RequestHandler>(AdminController.prototype.getImportJobStatus)),

            async function AdminController_getImportJobStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAdminController_getImportJobStatus, request, response });

                const controller = new AdminController();

              await templateService.apiHandler({
                methodName: 'getImportJobStatus',
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
