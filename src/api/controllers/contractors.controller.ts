/**
 * TSOA Controller for Contractors
 * 
 * Handles contractor (organization) management including:
 * - GET endpoints for retrieving contractors
 * - POST endpoint for creating contractors
 * - PUT endpoint for updating contractors
 * - Contractor access control
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1
 */

import {
  Controller,
  Route,
  Get,
  Post,
  Put,
  Body,
  Path,
  Query,
  Request,
  Response,
  Security,
  Middlewares,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "./base.controller.js"
import {
  Contractor,
  ContractorResponse,
  ContractorsListResponse,
  ContractorSearchResponse,
  CreateContractorPayload,
  UpdateContractorPayload,
  LinkContractorPayload,
  SuccessResponse as SuccessResponseType,
} from "../models/contractors.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse as ValidationError,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import {
  ValidationErrorClass as ValidationErrorClass,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "./base.controller.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import { contractorDetails } from "../routes/v1/util/formatting.js"
import { authorizeContractor, createContractor } from "../routes/v1/contractors/helpers.js"
import { User } from "../routes/v1/api-models.js"
import {
  tsoaReadRateLimit,
  tsoaWriteRateLimit,
  tsoaCriticalRateLimit,
} from "../middleware/tsoa-ratelimit.js"

@Route("api/contractors")
export class ContractorsController extends BaseController {
  /**
   * Get all contractors
   * @summary Retrieve all contractors
   */
  @Get("")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getContractors(): Promise<ContractorsListResponse> {
    try {
      // Get all contractors (not archived)
      const contractors = await contractorDb.getContractor({})
      
      // Return as array - cast to any to avoid type mismatch
      const contractorsList = Array.isArray(contractors) ? contractors : [contractors]
      
      return this.success({ contractors: contractorsList as any })
    } catch (error) {
      this.logError("getContractors", error)
      return this.handleError(error, "getContractors")
    }
  }

  /**
   * Search contractors
   * @summary Search for contractors by name or spectrum ID
   * @param query Search query string
   * @param language_codes Optional comma-separated language codes to filter by
   */
  @Get("search/{query}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchContractors(
    @Path() query: string,
    @Query() language_codes?: string,
    @Request() request?: ExpressRequest,
  ): Promise<ContractorSearchResponse> {
    try {
      // Parse language codes if provided
      const languageCodesArray = language_codes
        ? language_codes.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined

      const contractors = await contractorDb.searchContractors(
        query,
        languageCodesArray,
      )

      const { cdn } = await import("../../clients/cdn/cdn.js")
      const results = await Promise.all(
        contractors.map(async (contractor) => {
          return {
            spectrum_id: contractor.spectrum_id,
            name: contractor.name,
            avatar: await cdn.getFileLinkResource(contractor.avatar),
          }
        }),
      )

      return this.success(results)
    } catch (error) {
      this.logError("searchContractors", error)
      return this.handleError(error, "searchContractors")
    }
  }

  /**
   * Get contractor by spectrum ID
   * @summary Retrieve a specific contractor by their spectrum ID
   * @param spectrum_id The contractor's spectrum ID
   */
  @Get("{spectrum_id}")
  @Middlewares(tsoaReadRateLimit)
  @Response<NotFound>(404, "Contractor not found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getContractor(
    @Path() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<ContractorResponse> {
    try {
      const contractor = await contractorDb.getContractor({ spectrum_id })
      
      if (!contractor) {
        throw new NotFoundError("Contractor not found")
      }

      const user = (request?.user as User) || null
      const details = await contractorDetails(contractor, user)

      return this.success(details as any)
    } catch (error) {
      this.logError("getContractor", error, { spectrum_id })
      return this.handleError(error, "getContractor")
    }
  }

  /**
   * Link RSI organization
   * @summary Link an existing RSI organization to the platform
   * @param payload Link contractor payload containing RSI spectrum ID
   */
  @Post("auth/link")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaCriticalRateLimit)
  @SuccessResponse(200, "Linked")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Failed to authenticate")
  @Response<Conflict>(409, "Organization already registered")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async linkContractor(
    @Body() payload: LinkContractorPayload,
    @Request() request: ExpressRequest,
  ): Promise<ContractorResponse> {
    try {
      const user = this.getUser(request)
      const spectrum_id = payload.contractor || ""

      // Check if contractor already exists
      try {
        const existingContractor = await contractorDb.getContractor({ spectrum_id })
        if (existingContractor) {
          throw new ConflictError("Org is already registered!")
        }
      } catch (error) {
        // If not found, continue with authorization
        if (!(error instanceof ConflictError)) {
          // Ignore not found errors
        } else {
          throw error
        }
      }

      // Authorize and create contractor
      if (await authorizeContractor(spectrum_id, user)) {
        const contractor = await contractorDb.getContractor({ spectrum_id })
        const details = await contractorDetails(contractor, user)
        return this.success(details as any)
      } else {
        throw new ForbiddenError("Failed to authenticate, code not found")
      }
    } catch (error) {
      this.logError("linkContractor", error)
      return this.handleError(error, "linkContractor")
    }
  }

  /**
   * Create new contractor
   * @summary Create a new contractor organization
   * @param payload Create contractor payload
   */
  @Post("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaCriticalRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Conflict>(409, "Organization already registered")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createContractor(
    @Body() payload: CreateContractorPayload,
    @Request() request: ExpressRequest,
  ): Promise<SuccessResponseType> {
    try {
      const user = this.getUser(request)

      // Validate required fields
      const validation = this.validateRequired(payload, [
        "name",
        "identifier",
        "description",
      ])
      if (!validation.valid) {
        throw new ValidationErrorClass("Missing required fields", {
          missing: validation.missing.join(", "),
        })
      }

      const { description, name, identifier, logo, banner, language_codes } = payload

      // Check if contractor already exists
      const spectrum_id = `~${identifier.toUpperCase()}`
      try {
        const existingContractor = await contractorDb.getContractor({ spectrum_id })
        if (existingContractor) {
          throw new ConflictError("Org is already registered!")
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          // Ignore not found errors
        } else {
          throw error
        }
      }

      // Create contractor
      await createContractor({
        description: description.trim(),
        name,
        spectrum_id,
        owner_id: user.user_id,
        logo: logo || "",
        banner: banner || "",
        member_count: 1,
        locale: user.locale,
        language_codes: language_codes || ["en"],
      })

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("createContractor", error)
      return this.handleError(error, "createContractor")
    }
  }

  /**
   * Update contractor
   * @summary Update contractor details
   * @param spectrum_id The contractor's spectrum ID
   * @param payload Update contractor payload
   */
  @Put("{spectrum_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Insufficient permissions")
  @Response<NotFound>(404, "Contractor not found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateContractor(
    @Path() spectrum_id: string,
    @Body() payload: UpdateContractorPayload,
    @Request() request: ExpressRequest,
  ): Promise<SuccessResponseType> {
    try {
      const user = this.getUser(request)

      // Get contractor
      const contractor = await contractorDb.getContractor({ spectrum_id })
      if (!contractor) {
        throw new NotFoundError("Contractor not found")
      }

      // Check if user has permission to update
      // User must be a member with manage_org_details permission
      const roles = await contractorDb.getMemberRoles(
        contractor.contractor_id,
        user.user_id,
      )

      if (roles.length === 0) {
        throw new ForbiddenError("You are not a member of this organization")
      }

      // Check if user has manage_org_details permission
      const hasPermission = roles.some((role) => role.manage_org_details)
      if (!hasPermission && user.role !== "admin") {
        throw new ForbiddenError("Insufficient permissions to update organization")
      }

      // Update contractor
      const updateData: any = {}
      if (payload.name !== undefined) {
        updateData.name = payload.name
      }
      if (payload.description !== undefined) {
        updateData.description = payload.description.trim()
      }

      if (Object.keys(updateData).length > 0) {
        await contractorDb.updateContractor(
          { contractor_id: contractor.contractor_id },
          updateData,
        )
      }

      // Update language codes if provided
      if (payload.language_codes !== undefined) {
        const { validateLanguageCodes } = await import("../../constants/languages.js")
        const validation = validateLanguageCodes(payload.language_codes)
        
        if (!validation.valid) {
          throw new ValidationErrorClass("Invalid language codes", {
            invalid: validation.invalid.join(", "),
          })
        }

        const codes = [...new Set(payload.language_codes)]
        await contractorDb.setContractorLanguages(contractor.contractor_id, codes)
      }

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("updateContractor", error, { spectrum_id })
      return this.handleError(error, "updateContractor")
    }
  }
}
