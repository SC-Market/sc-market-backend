/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../health/HealthController.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DebugV2Controller } from './../debug/DebugV2Controller.js';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FeatureFlagAdminController } from './../admin/FeatureFlagAdminController.js';
import { expressAuthentication } from './../middleware/tsoa-auth.js';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
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
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
