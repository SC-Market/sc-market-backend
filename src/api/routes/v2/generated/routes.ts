/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { VariantTypesV2Controller } from './../variant-types/VariantTypesV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ListingsV2Controller } from './../listings/ListingsV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../health/HealthController.js';
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
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
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

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
