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
import { ListingsV2Controller } from './../listings/ListingsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../health/HealthController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { GameItemsV2Controller } from './../game-items/GameItemsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DebugV2Controller } from './../debug/DebugV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CartV2Controller } from './../cart/CartV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BuyOrdersV2Controller } from './../buy-orders/BuyOrdersV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AnalyticsV2Controller } from './../analytics/AnalyticsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FeatureFlagAdminController } from './../admin/FeatureFlagAdminController.js';
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
            "crafted_source": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["crafted"]},{"dataType":"enum","enums":["store"]},{"dataType":"enum","enums":["looted"]},{"dataType":"enum","enums":["unknown"]}]},
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
    "UpdateStockLotResponse": {
        "dataType": "refObject",
        "properties": {
            "lot": {"ref":"StockLotDetail","required":true},
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
    "GetOrderDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "buyer": {"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "seller": {"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"display_name":{"dataType":"string","required":true},"username":{"dataType":"string","required":true},"user_id":{"dataType":"string","required":true}},"required":true},
            "total_price": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
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
    "CreateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"string","required":true},
            "pricing_mode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unified"]},{"dataType":"enum","enums":["per_variant"]}],"required":true},
            "base_price": {"dataType":"double"},
            "lots": {"dataType":"array","array":{"dataType":"refObject","ref":"StockLotInput"},"required":true},
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
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SellerInfo": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "slug": {"dataType":"string","required":true},
            "rating": {"dataType":"double","required":true},
            "avatar_url": {"dataType":"string"},
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
            "variant_count": {"dataType":"double","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "seller_slug": {"dataType":"string","required":true},
            "created_at": {"dataType":"string","required":true},
            "updated_at": {"dataType":"string","required":true},
            "game_item_name": {"dataType":"string","required":true},
            "game_item_type": {"dataType":"string","required":true},
            "seller_rating_count": {"dataType":"double","required":true},
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
            "description": {"dataType":"string"},
            "base_price": {"dataType":"double"},
            "variant_prices": {"dataType":"array","array":{"dataType":"refObject","ref":"VariantPriceUpdate"}},
            "lot_updates": {"dataType":"array","array":{"dataType":"refObject","ref":"LotUpdate"}},
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
    "MarketVersion": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["V1"]},{"dataType":"enum","enums":["V2"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetFeatureFlagResponse": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
            "is_developer": {"dataType":"boolean","required":true},
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
            "seller_rating": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
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
            "order_id": {"dataType":"string","required":true},
            "total_price": {"dataType":"double","required":true},
            "items_purchased": {"dataType":"double","required":true},
            "unavailable_items": {"dataType":"array","array":{"dataType":"refObject","ref":"UnavailableCartItem"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutCartRequest": {
        "dataType": "refObject",
        "properties": {
            "confirm_price_changes": {"dataType":"boolean"},
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
            "created_at": {"dataType":"datetime","required":true},
            "updated_at": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateConfigRequest": {
        "dataType": "refObject",
        "properties": {
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
            "total_overrides": {"dataType":"double","required":true},
            "v1_overrides": {"dataType":"double","required":true},
            "v2_overrides": {"dataType":"double","required":true},
            "rollout_percentage": {"dataType":"double","required":true},
            "default_version": {"ref":"MarketVersion","required":true},
            "enabled": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserOverride": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
            "updated_at": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UserOverridesResponse": {
        "dataType": "refObject",
        "properties": {
            "overrides": {"dataType":"array","array":{"dataType":"refObject","ref":"UserOverride"},"required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SetUserOverrideRequest": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "market_version": {"ref":"MarketVersion","required":true},
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
        const argsOrdersV2Controller_createOrder: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateOrderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/orders',
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
        const argsListingsV2Controller_createListing: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateListingRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings',
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
        const argsListingsV2Controller_updateListing: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateListingRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/listings/:id',
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
        const argsListingsV2Controller_getMyListings: Record<string, TsoaRoute.ParameterSchema> = {
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
                page: {"in":"query","name":"page","dataType":"double"},
                page_size: {"in":"query","name":"page_size","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quantity"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/listings/mine',
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
        const argsListingsV2Controller_refreshListing: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/listings/:id/refresh',
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
        const argsDebugV2Controller_getFeatureFlag: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/debug/feature-flag',
            authenticateMiddleware([{"jwt":[]}]),
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
            authenticateMiddleware([{"jwt":[]}]),
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
        const argsBuyOrdersV2Controller_createBuyOrder: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CreateBuyOrderRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/buy-orders',
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(BuyOrdersV2Controller.prototype.createBuyOrder)),

            async function BuyOrdersV2Controller_createBuyOrder(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsBuyOrdersV2Controller_createBuyOrder, request, response });

                const controller = new BuyOrdersV2Controller();

              await templateService.apiHandler({
                methodName: 'createBuyOrder',
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
        };
        app.get('/admin/feature-flags/overrides',
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
                userId: {"in":"path","name":"userId","required":true,"dataType":"string"},
        };
        app.delete('/admin/feature-flags/overrides/:userId',
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
