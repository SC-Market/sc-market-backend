/**
 * Contracts Controller
 * Handles public contract management
 */

import {
  Controller,
  Get,
  Post,
  Route,
  Path,
  Body,
  Security,
  Middlewares,
  Request,
  Response,
  SuccessResponse,
} from "tsoa"
import { BaseController, NotFoundError, ValidationErrorClass, ForbiddenError, ConflictError } from "./base.controller.js"
import {
  CreateContractRequest,
  CreateContractOfferRequest,
  ContractResponse,
  CreateContractResponse,
  CreateContractOfferResponse,
  ContractsListResponse,
} from "../models/contracts.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as contractDb from "../routes/v1/contracts/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as offerDb from "../routes/v1/offers/database.js"
import { createOffer } from "../routes/v1/orders/helpers.js"
import { has_permission } from "../routes/v1/util/permissions.js"
import { serializePublicContract } from "../routes/v1/contracts/serializers.js"
import { database } from "../../clients/database/knex-db.js"
import { DBPublicContract } from "../routes/v1/contracts/types.js"
import type { Request as ExpressRequest } from "express"

interface AuthenticatedRequest extends ExpressRequest {
  user?: any
  contract?: DBPublicContract
}

/**
 * Controller for public contract management
 */
@Route("api/v1/contracts")
export class ContractsController extends BaseController {
  /**
   * Create a new public contract
   * @summary Create public contract
   */
  @Post()
  @Security("sessionAuth")
  @Security("bearerAuth", ["orders:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ValidationErrorResponse>(400, "Validation error")
  @SuccessResponse(201, "Contract created successfully")
  public async createContract(
    @Body() body: CreateContractRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<CreateContractResponse> {
    const user = this.getUser(request)

    const [contract] = await contractDb.insertPublicContract({
      title: body.title,
      description: body.description,
      departure: body.departure,
      destination: body.destination,
      cost: body.cost,
      payment_type: body.payment_type,
      kind: body.kind,
      collateral: body.collateral,
      customer_id: user.user_id,
    })

    // Status set by TSOA
    return { contract_id: contract.id }
  }

  /**
   * Create an offer on a public contract
   * @summary Create offer on contract
   */
  @Post("{contract_id}/offers")
  @Security("sessionAuth")
  @Security("bearerAuth", ["orders:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Cannot create offer")
  @Response<NotFound>(404, "Contract not found")
  @Response<ValidationErrorResponse>(400, "Validation error")
  @Response<Conflict>(409, "Contractor archived")
  @SuccessResponse(201, "Offer created successfully")
  public async createContractOffer(
    @Path() contract_id: string,
    @Body() body: CreateContractOfferRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<CreateContractOfferResponse> {
    const user = this.getUser(request)

    // Get contract
    const contracts = await contractDb.getPublicContract({ id: contract_id })
    const contract = contracts[0]
    if (!contract) {
      throw new NotFoundError("Contract not found")
    }

    // Validate contract is public and active
    if (contract.status !== "active") {
      throw new ValidationErrorClass("Contract is not active")
    }

    // Check if user is trying to create offer on their own contract
    if (contract.customer_id === user.user_id && !body.contractor) {
      throw new ValidationErrorClass(
        "You cannot create an offer on your own contract",
      )
    }

    let contractor = null
    if (body.contractor) {
      try {
        contractor = await contractorDb.getContractor({
          spectrum_id: body.contractor,
        })
      } catch {
        throw new ValidationErrorClass("Invalid contractor")
      }

      if (contractor.archived) {
        throw new ConflictError("Cannot create offers for an archived contractor")
      }

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        throw new ForbiddenError(
          "You do not have permission to make offers on behalf of this contractor",
        )
      }
    }

    // Check if customer is blocked by contractor
    const isBlocked = await profileDb.checkIfBlockedForOrder(
      contract.customer_id,
      contractor?.contractor_id || null,
      contractor ? null : user?.user_id,
      user?.user_id || "",
    )
    if (isBlocked) {
      throw new ForbiddenError(
        "You are blocked from creating offers with this contractor or user",
      )
    }

    // Validate order limits
    const seller_contractor_id = contractor?.contractor_id || null
    const seller_user_id = contractor ? null : user?.user_id || null

    try {
      const { validateOrderLimits } = await import(
        "../routes/v1/orders/helpers.js"
      )
      await validateOrderLimits(
        seller_contractor_id,
        seller_user_id,
        0, // No market listings for contract offers
        body.cost,
      )
    } catch (error) {
      throw new ValidationErrorClass(
        error instanceof Error
          ? error.message
          : "Order does not meet size or value requirements",
      )
    }

    const { session, discord_invite } = await createOffer(
      {
        assigned_id: contractor ? null : user?.user_id,
        contractor_id: contractor?.contractor_id,
        customer_id: contract.customer_id,
      },
      {
        actor_id: user.user_id,
        kind: body.kind,
        description: body.description,
        cost: body.cost,
        title: body.title,
        collateral: body.collateral || 0,
        payment_type: body.payment_type,
      },
    )

    await offerDb.insertContractOffers({
      contract_id: contract.id,
      session_id: session.id,
    })

    // Status set by TSOA
    return {
      session_id: session.id,
      discord_invite: discord_invite ?? undefined,
    }
  }

  /**
   * Get public contract details
   * @summary Get contract by ID
   */
  @Get("{contract_id}")
  @Middlewares(tsoaReadRateLimit)
  @Response<NotFound>(404, "Contract not found")
  public async getContract(
    @Path() contract_id: string,
  ): Promise<ContractResponse> {
    const contracts = await contractDb.getPublicContract({ id: contract_id })
    const contract = contracts[0]
    if (!contract) {
      throw new NotFoundError("Contract not found")
    }

    // Validate contract is public
    if (contract.status !== "active") {
      throw new NotFoundError("Contract not found")
    }

    return await serializePublicContract(contract)
  }

  /**
   * List all active public contracts
   * @summary List active contracts
   */
  @Get()
  @Middlewares(tsoaReadRateLimit)
  public async listContracts(): Promise<ContractResponse[]> {
    const contracts = await database
      .knex<DBPublicContract>("public_contracts")
      .where({ status: "active" })
      .orderBy("timestamp", "DESC")
      .select()

    return await Promise.all(contracts.map(serializePublicContract))
  }
}
