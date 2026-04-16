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
import { DebugV2Controller } from './../debug/DebugV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CartV2Controller } from './../cart/CartV2Controller.js';
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
            "created_at": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VariantTypesResponse": {
        "dataType": "refObject",
        "properties": {
            "variant_types": {"dataType":"array","array":{"dataType":"refObject","ref":"VariantType"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VariantTypeResponse": {
        "dataType": "refObject",
        "properties": {
            "variant_type": {"ref":"VariantType","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLotDetail": {
        "dataType": "refObject",
        "properties": {
            "lot_id": {"dataType":"string","required":true},
            "item_id": {"dataType":"string","required":true},
            "listing": {"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}},"required":true},
            "game_item": {"dataType":"nestedObjectLiteral","nestedProperties":{"type":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"game_item_id":{"dataType":"string","required":true}},"required":true},
            "variant": {"dataType":"nestedObjectLiteral","nestedProperties":{"quality_tier":{"dataType":"double","required":true},"attributes":{"ref":"Record_string.any_","required":true},"short_name":{"dataType":"string","required":true},"display_name":{"dataType":"string","required":true},"variant_id":{"dataType":"string","required":true}},"required":true},
            "quantity_total": {"dataType":"double","required":true},
            "location_id": {"dataType":"string"},
            "listed": {"dataType":"boolean","required":true},
            "notes": {"dataType":"string"},
            "created_at": {"dataType":"datetime","required":true},
            "updated_at": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StockLotsResponse": {
        "dataType": "refObject",
        "properties": {
            "stock_lots": {"dataType":"array","array":{"dataType":"refObject","ref":"StockLotDetail"},"required":true},
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
            "location_id": {"dataType":"string"},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkStockUpdateResponse": {
        "dataType": "refObject",
        "properties": {
            "successful": {"dataType":"double","required":true},
            "failed": {"dataType":"double","required":true},
            "errors": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"error":{"dataType":"string","required":true},"lot_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BulkStockUpdateRequest": {
        "dataType": "refObject",
        "properties": {
            "stock_lot_ids": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "operation": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["update_quantity"]},{"dataType":"enum","enums":["list"]},{"dataType":"enum","enums":["unlist"]},{"dataType":"enum","enums":["transfer_location"]}],"required":true},
            "quantity_delta": {"dataType":"double"},
            "listed": {"dataType":"boolean"},
            "location_id": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "OrderDetailV2": {
        "dataType": "refObject",
        "properties": {
            "order": {"dataType":"nestedObjectLiteral","nestedProperties":{"created_at":{"dataType":"datetime","required":true},"total_price":{"dataType":"double","required":true},"status":{"dataType":"string","required":true},"seller_id":{"dataType":"string","required":true},"buyer_id":{"dataType":"string","required":true},"order_id":{"dataType":"string","required":true}},"required":true},
            "buyer": {"dataType":"nestedObjectLiteral","nestedProperties":{"rating":{"dataType":"double","required":true},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},
            "seller": {"dataType":"nestedObjectLiteral","nestedProperties":{"rating":{"dataType":"double","required":true},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},
            "items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"fulfillment_status":{"dataType":"string","required":true},"price_per_unit":{"dataType":"double","required":true},"quantity":{"dataType":"double","required":true},"variant":{"dataType":"nestedObjectLiteral","nestedProperties":{"quality_tier":{"dataType":"double","required":true},"attributes":{"ref":"Record_string.any_","required":true},"display_name":{"dataType":"string","required":true},"variant_id":{"dataType":"string","required":true}},"required":true},"game_item":{"dataType":"nestedObjectLiteral","nestedProperties":{"type":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"game_item_id":{"dataType":"string","required":true}},"required":true},"order_item_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateOrderRequest": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"quantity":{"dataType":"double","required":true},"variant_id":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "listings": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"created_at":{"dataType":"datetime","required":true},"variant_count":{"dataType":"double","required":true},"quality_tier_max":{"dataType":"double","required":true},"quality_tier_min":{"dataType":"double","required":true},"quantity_available":{"dataType":"double","required":true},"price_max":{"dataType":"double","required":true},"price_min":{"dataType":"double","required":true},"seller_rating":{"dataType":"double","required":true},"seller_name":{"dataType":"string","required":true},"title":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}}},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Listing": {
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
            "created_at": {"dataType":"datetime","required":true},
            "updated_at": {"dataType":"datetime","required":true},
            "expires_at": {"dataType":"datetime"},
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
        "additionalProperties": {"dataType":"any"},
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
            "lots": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"price":{"dataType":"double"},"location_id":{"dataType":"string"},"variant_attributes":{"ref":"VariantAttributes","required":true},"quantity":{"dataType":"double","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "listing": {"ref":"Listing","required":true},
            "seller": {"dataType":"nestedObjectLiteral","nestedProperties":{"rating":{"dataType":"double","required":true},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},
            "items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"variants":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"locations":{"dataType":"array","array":{"dataType":"string"}},"price":{"dataType":"double","required":true},"quantity":{"dataType":"double","required":true},"short_name":{"dataType":"string","required":true},"display_name":{"dataType":"string","required":true},"attributes":{"ref":"Record_string.any_","required":true},"variant_id":{"dataType":"string","required":true}}},"required":true},"base_price":{"dataType":"double"},"pricing_mode":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["unified"]},{"dataType":"enum","enums":["per_variant"]}],"required":true},"game_item":{"dataType":"nestedObjectLiteral","nestedProperties":{"icon_url":{"dataType":"string"},"type":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"game_item_id":{"dataType":"string","required":true}},"required":true},"item_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MyListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "listings": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"quality_tier_max":{"dataType":"double","required":true},"quality_tier_min":{"dataType":"double","required":true},"price_max":{"dataType":"double","required":true},"price_min":{"dataType":"double","required":true},"total_quantity":{"dataType":"double","required":true},"variant_count":{"dataType":"double","required":true},"created_at":{"dataType":"datetime","required":true},"status":{"dataType":"string","required":true},"title":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}}},"required":true},
            "total": {"dataType":"double","required":true},
            "page": {"dataType":"double","required":true},
            "page_size": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "description": {"dataType":"string"},
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
            "base_price": {"dataType":"double"},
            "variant_prices": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"price":{"dataType":"double","required":true},"variant_id":{"dataType":"string","required":true}}}},
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
    "CartSellerV2": {
        "dataType": "refObject",
        "properties": {
            "seller_id": {"dataType":"string","required":true},
            "seller_name": {"dataType":"string","required":true},
            "seller_type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["user"]},{"dataType":"enum","enums":["contractor"]}],"required":true},
            "buyer_note": {"dataType":"string"},
            "items": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"is_available":{"dataType":"boolean","required":true},"is_price_stale":{"dataType":"boolean","required":true},"current_price":{"dataType":"double","required":true},"price_per_unit":{"dataType":"double","required":true},"quantity":{"dataType":"double","required":true},"variant":{"dataType":"nestedObjectLiteral","nestedProperties":{"quality_tier":{"dataType":"double","required":true},"attributes":{"ref":"Record_string.any_","required":true},"display_name":{"dataType":"string","required":true},"variant_id":{"dataType":"string","required":true}},"required":true},"game_item":{"dataType":"nestedObjectLiteral","nestedProperties":{"type":{"dataType":"string","required":true},"name":{"dataType":"string","required":true},"game_item_id":{"dataType":"string","required":true}},"required":true},"listing":{"dataType":"nestedObjectLiteral","nestedProperties":{"title":{"dataType":"string","required":true},"listing_id":{"dataType":"string","required":true}},"required":true},"cart_item_id":{"dataType":"string","required":true}}},"required":true},
            "subtotal": {"dataType":"double","required":true},
            "stale_items_count": {"dataType":"double","required":true},
            "unavailable_items_count": {"dataType":"double","required":true},
            "availability_required": {"dataType":"boolean"},
            "availability_set": {"dataType":"boolean"},
            "order_limits": {"dataType":"nestedObjectLiteral","nestedProperties":{"max_order_value":{"dataType":"string"},"min_order_value":{"dataType":"string"},"max_order_size":{"dataType":"string"},"min_order_size":{"dataType":"string"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartDetailV2": {
        "dataType": "refObject",
        "properties": {
            "sellers": {"dataType":"array","array":{"dataType":"refObject","ref":"CartSellerV2"},"required":true},
            "total_price": {"dataType":"double","required":true},
            "stale_items_count": {"dataType":"double","required":true},
            "unavailable_items_count": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartItemV2": {
        "dataType": "refObject",
        "properties": {
            "cart_item_id": {"dataType":"string","required":true},
            "user_id": {"dataType":"string","required":true},
            "seller_id": {"dataType":"string","required":true},
            "listing_id": {"dataType":"string","required":true},
            "item_id": {"dataType":"string","required":true},
            "variant_id": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
            "price_per_unit": {"dataType":"double","required":true},
            "price_updated_at": {"dataType":"datetime","required":true},
            "buyer_note": {"dataType":"string"},
            "created_at": {"dataType":"datetime","required":true},
            "updated_at": {"dataType":"datetime","required":true},
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
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateCartNotesRequest": {
        "dataType": "refObject",
        "properties": {
            "seller_id": {"dataType":"string","required":true},
            "buyer_note": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutCartResponse": {
        "dataType": "refObject",
        "properties": {
            "order_id": {"dataType":"string","required":true},
            "session_id": {"dataType":"string","required":true},
            "discord_invite": {"dataType":"string"},
            "order_details": {"ref":"OrderDetailV2"},
            "items_removed": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "price_changes": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"percentage_change":{"dataType":"double","required":true},"new_price":{"dataType":"double","required":true},"old_price":{"dataType":"double","required":true},"cart_item_id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutCartRequest": {
        "dataType": "refObject",
        "properties": {
            "seller_id": {"dataType":"string","required":true},
            "accept_price_changes": {"dataType":"boolean"},
            "offer_amount": {"dataType":"double"},
            "buyer_note": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FeatureFlagConfig": {
        "dataType": "refObject",
        "properties": {
            "key": {"dataType":"string","required":true},
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


    
        const argsVariantTypesV2Controller_getAllVariantTypes: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/variant-types',
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller.prototype.getAllVariantTypes)),

            async function VariantTypesV2Controller_getAllVariantTypes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVariantTypesV2Controller_getAllVariantTypes, request, response });

                const controller = new VariantTypesV2Controller();

              await templateService.apiHandler({
                methodName: 'getAllVariantTypes',
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
        const argsVariantTypesV2Controller_getVariantTypeById: Record<string, TsoaRoute.ParameterSchema> = {
                variant_type_id: {"in":"path","name":"variant_type_id","required":true,"dataType":"string"},
        };
        app.get('/variant-types/:variant_type_id',
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(VariantTypesV2Controller.prototype.getVariantTypeById)),

            async function VariantTypesV2Controller_getVariantTypeById(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsVariantTypesV2Controller_getVariantTypeById, request, response });

                const controller = new VariantTypesV2Controller();

              await templateService.apiHandler({
                methodName: 'getVariantTypeById',
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
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
                listing_id: {"in":"query","name":"listing_id","dataType":"string"},
                game_item_id: {"in":"query","name":"game_item_id","dataType":"string"},
                location_id: {"in":"query","name":"location_id","dataType":"string"},
                quality_tier_min: {"in":"query","name":"quality_tier_min","dataType":"double"},
                quality_tier_max: {"in":"query","name":"quality_tier_max","dataType":"double"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
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
                lot_id: {"in":"path","name":"lot_id","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"UpdateStockLotRequest"},
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
        };
        app.put('/stock-lots/:lot_id',
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
                request: {"in":"body","name":"request","required":true,"ref":"BulkStockUpdateRequest"},
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
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
        app.post('/api/v2/orders',
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
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersV2Controller_getOrderDetail: Record<string, TsoaRoute.ParameterSchema> = {
                order_id: {"in":"path","name":"order_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v2/orders/:order_id',
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
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsOrdersV2Controller_getOrders: Record<string, TsoaRoute.ParameterSchema> = {
                role: {"in":"query","name":"role","dataType":"union","subSchemas":[{"dataType":"enum","enums":["buyer"]},{"dataType":"enum","enums":["seller"]}]},
                status: {"in":"query","name":"status","dataType":"string"},
                quality_tier: {"in":"query","name":"quality_tier","dataType":"double"},
                date_from: {"in":"query","name":"date_from","dataType":"string"},
                date_to: {"in":"query","name":"date_to","dataType":"string"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["total_price"]},{"dataType":"enum","enums":["quality_tier"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
                request: {"in":"request","name":"request","dataType":"object"},
        };
        app.get('/api/v2/orders',
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
                successStatus: 200,
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
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
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
        const argsListingsV2Controller_createListing: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"body","name":"request","required":true,"ref":"CreateListingRequest"},
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
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
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.get('/listings/:listing_id',
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
        const argsListingsV2Controller_getMyListings: Record<string, TsoaRoute.ParameterSchema> = {
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
                status: {"in":"query","name":"status","dataType":"union","subSchemas":[{"dataType":"enum","enums":["active"]},{"dataType":"enum","enums":["sold"]},{"dataType":"enum","enums":["expired"]},{"dataType":"enum","enums":["cancelled"]}]},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                page_size: {"default":20,"in":"query","name":"page_size","dataType":"double"},
                sort_by: {"in":"query","name":"sort_by","dataType":"union","subSchemas":[{"dataType":"enum","enums":["created_at"]},{"dataType":"enum","enums":["updated_at"]},{"dataType":"enum","enums":["price"]},{"dataType":"enum","enums":["quantity"]}]},
                sort_order: {"in":"query","name":"sort_order","dataType":"union","subSchemas":[{"dataType":"enum","enums":["asc"]},{"dataType":"enum","enums":["desc"]}]},
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
        const argsListingsV2Controller_updateListing: Record<string, TsoaRoute.ParameterSchema> = {
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
                request: {"in":"body","name":"request","required":true,"ref":"UpdateListingRequest"},
                expressRequest: {"in":"request","name":"expressRequest","required":true,"dataType":"object"},
        };
        app.put('/listings/:listing_id',
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
        app.get('/api/v2/cart',
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
                successStatus: 200,
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
        app.post('/api/v2/cart/add',
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
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartV2Controller_updateCartItem: Record<string, TsoaRoute.ParameterSchema> = {
                cart_item_id: {"in":"path","name":"cart_item_id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateCartItemRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v2/cart/:cart_item_id',
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
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartV2Controller_removeFromCart: Record<string, TsoaRoute.ParameterSchema> = {
                cart_item_id: {"in":"path","name":"cart_item_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v2/cart/:cart_item_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.removeFromCart)),

            async function CartV2Controller_removeFromCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_removeFromCart, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'removeFromCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 204,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartV2Controller_updateCartNotes: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateCartNotesRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v2/cart/notes',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.updateCartNotes)),

            async function CartV2Controller_updateCartNotes(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_updateCartNotes, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'updateCartNotes',
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
        const argsCartV2Controller_clearCartForSeller: Record<string, TsoaRoute.ParameterSchema> = {
                seller_id: {"in":"path","name":"seller_id","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v2/cart/seller/:seller_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller)),
            ...(fetchMiddlewares<RequestHandler>(CartV2Controller.prototype.clearCartForSeller)),

            async function CartV2Controller_clearCartForSeller(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartV2Controller_clearCartForSeller, request, response });

                const controller = new CartV2Controller();

              await templateService.apiHandler({
                methodName: 'clearCartForSeller',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 204,
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
        app.post('/api/v2/cart/checkout',
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
                successStatus: 200,
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
