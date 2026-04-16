/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
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
