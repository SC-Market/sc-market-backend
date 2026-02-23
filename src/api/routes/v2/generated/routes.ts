/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarketController } from './../market/MarketController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../health/HealthController.js';
import { expressAuthentication } from './../middleware/tsoa-auth.js';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "MinimalUser": {
        "dataType": "refObject",
        "properties": {
            "user_id": {"dataType":"string","required":true},
            "username": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MinimalContractor": {
        "dataType": "refObject",
        "properties": {
            "contractor_id": {"dataType":"string","required":true},
            "spectrum_id": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "avatar": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListingResponse": {
        "dataType": "refObject",
        "properties": {
            "listing_id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity_available": {"dataType":"double","required":true},
            "status": {"dataType":"string","required":true},
            "sale_type": {"dataType":"string","required":true},
            "item_type": {"dataType":"string","required":true},
            "game_item_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "user_seller": {"dataType":"union","subSchemas":[{"ref":"MinimalUser"},{"dataType":"enum","enums":[null]}],"required":true},
            "contractor_seller": {"dataType":"union","subSchemas":[{"ref":"MinimalContractor"},{"dataType":"enum","enums":[null]}],"required":true},
            "timestamp": {"dataType":"string","required":true},
            "expiration": {"dataType":"string","required":true},
            "photos": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "internal": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaginatedListingsResponse": {
        "dataType": "refObject",
        "properties": {
            "listings": {"dataType":"array","array":{"dataType":"refObject","ref":"ListingResponse"},"required":true},
            "total": {"dataType":"double","required":true},
            "limit": {"dataType":"double","required":true},
            "offset": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "quantity": {"dataType":"double","required":true},
            "game_item_id": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "item_type": {"dataType":"string","required":true},
            "sale_type": {"dataType":"string"},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
            "spectrum_id": {"dataType":"string"},
            "internal": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateListingRequest": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string"},
            "description": {"dataType":"string"},
            "price": {"dataType":"double"},
            "quantity_available": {"dataType":"double"},
            "status": {"dataType":"string"},
            "item_type": {"dataType":"string"},
            "item_name": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "photos": {"dataType":"array","array":{"dataType":"string"}},
            "internal": {"dataType":"boolean"},
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


    
        const argsMarketController_getListings: Record<string, TsoaRoute.ParameterSchema> = {
                search: {"in":"query","name":"search","dataType":"string"},
                game_item_id: {"in":"query","name":"game_item_id","dataType":"string"},
                item_type: {"in":"query","name":"item_type","dataType":"string"},
                sale_type: {"in":"query","name":"sale_type","dataType":"string"},
                status: {"in":"query","name":"status","dataType":"string"},
                min_price: {"in":"query","name":"min_price","dataType":"double"},
                max_price: {"in":"query","name":"max_price","dataType":"double"},
                user_seller_id: {"in":"query","name":"user_seller_id","dataType":"string"},
                contractor_seller_id: {"in":"query","name":"contractor_seller_id","dataType":"string"},
                limit: {"default":50,"in":"query","name":"limit","dataType":"double"},
                offset: {"default":0,"in":"query","name":"offset","dataType":"double"},
                sort: {"in":"query","name":"sort","dataType":"string"},
                reverse_sort: {"in":"query","name":"reverse_sort","dataType":"boolean"},
        };
        app.get('/v2/market/listings',
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.getListings)),

            async function MarketController_getListings(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_getListings, request, response });

                const controller = new MarketController();

              await templateService.apiHandler({
                methodName: 'getListings',
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
        const argsMarketController_getListing: Record<string, TsoaRoute.ParameterSchema> = {
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.get('/v2/market/listings/:listing_id',
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.getListing)),

            async function MarketController_getListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_getListing, request, response });

                const controller = new MarketController();

              await templateService.apiHandler({
                methodName: 'getListing',
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
        const argsMarketController_createListing: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateListingRequest"},
        };
        app.post('/v2/market/listings',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.createListing)),

            async function MarketController_createListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_createListing, request, response });

                const controller = new MarketController();

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
        const argsMarketController_updateListing: Record<string, TsoaRoute.ParameterSchema> = {
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateListingRequest"},
        };
        app.put('/v2/market/listings/:listing_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.updateListing)),

            async function MarketController_updateListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_updateListing, request, response });

                const controller = new MarketController();

              await templateService.apiHandler({
                methodName: 'updateListing',
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
        const argsMarketController_deleteListing: Record<string, TsoaRoute.ParameterSchema> = {
                listing_id: {"in":"path","name":"listing_id","required":true,"dataType":"string"},
        };
        app.delete('/v2/market/listings/:listing_id',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.deleteListing)),

            async function MarketController_deleteListing(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_deleteListing, request, response });

                const controller = new MarketController();

              await templateService.apiHandler({
                methodName: 'deleteListing',
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
