/**
 * Orders Controller
 *
 * TSOA controller for order management endpoints.
 * This controller handles order creation, retrieval, updates, and search.
 *
 * Migration Status: Phase 4 - Authentication-heavy endpoints
 * - GET /api/orders/search (search orders)
 * - GET /api/orders/contractor/:spectrum_id/metrics (get contractor metrics)
 * - GET /api/orders/contractor/:spectrum_id/data (get contractor order data)
 * - GET /api/orders/user/data (get user order data)
 * - GET /api/orders/:order_id (get order by ID)
 * - POST /api/orders (create order)
 * - POST /api/orders/:order_id/thread (create order thread)
 * - POST /api/orders/:order_id/applicants (apply to order)
 * - POST /api/orders/:order_id/applicants/contractors/:spectrum_id (accept contractor applicant)
 * - POST /api/orders/:order_id/applicants/users/:username (accept user applicant)
 * - PUT /api/orders/:order_id (update order)
 *
 * @tags Orders
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Path,
  Query,
  Body,
  Route,
  Response,
  Tags,
  Request,
  Middlewares,
  Security,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import {
  BaseController,
  NotFoundError,
  ValidationErrorClass,
  ForbiddenError,
  ConflictError,
} from "./base.controller.js"
import {
  OrderSearchResponse,
  OrderResponse,
  CreateOrderResponse,
  OrderMetricsResponse,
  ContractorOrderDataResponse,
  UserOrderDataResponse,
  SuccessResponse,
  CreateOrderPayload,
  UpdateOrderPayload,
  ApplyToOrderPayload,
  OrderSearchQuery,
} from "../models/orders.models.js"
import {
  ErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import {
  tsoaReadRateLimit,
  tsoaWriteRateLimit,
} from "../middleware/tsoa-ratelimit.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as orderDb from "../routes/v1/orders/database.js"
import * as orderHelpers from "../routes/v1/orders/helpers.js"
import { formatOrderStubOptimized } from "../routes/v1/util/formatting.js"
import { has_permission, is_member } from "../routes/v1/util/permissions.js"
import { serializeOrderDetails } from "../routes/v1/orders/serializers.js"
import { discordService } from "../../services/discord/discord.service.js"
import { DBOrder } from "../../clients/database/db-models.js"
import { User } from "../routes/v1/api-models.js"

/**
 * Controller for managing orders
 */
@Route("api/orders")
@Tags("Orders")
export class OrdersController extends BaseController {
  /**
   * Search orders
   *
   * Search for orders with various filters.
   * Requires authentication and appropriate permissions.
   *
   * @summary Search orders
   * @param request Express request
   * @param customer Filter by customer username
   * @param assigned Filter by assigned user username
   * @param contractor Filter by contractor spectrum ID
   * @param status Filter by order status
   * @param sort_method Sort method
   * @param sort_order Sort order
   * @param page Page number
   * @param limit Items per page
   * @returns List of orders matching search criteria
   */
  @Get("search")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchOrders(
    @Request() request: ExpressRequest,
    @Query() customer?: string,
    @Query() assigned?: string,
    @Query() contractor?: string,
    @Query() status?: string,
    @Query() sort_method?: string,
    @Query() sort_order?: string,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<OrderSearchResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:read")) {
          throw new ForbiddenError("Insufficient permissions: orders:read scope required")
        }
      }

      // Build search query
      const query: OrderSearchQuery = {
        customer,
        assigned,
        contractor,
        status: status as any,
        sort_method: sort_method as any,
        sort_order: sort_order as any,
        page,
        limit,
      }

      // Convert query to internal format
      const args = await orderHelpers.convert_order_search_query({
        ...request,
        query,
      } as any)

      // Permission checks
      if (!(args.contractor_id || args.assigned_id || args.customer_id)) {
        if (user.role !== "admin") {
          throw new ForbiddenError("Missing permissions")
        }
      }

      if (args.contractor_id) {
        if (!(await is_member(args.contractor_id, user.user_id))) {
          throw new ForbiddenError("Missing permissions")
        }
      }

      if (args.assigned_id && args.assigned_id !== user.user_id) {
        if (!args.contractor_id) {
          throw new ForbiddenError("Missing permissions")
        }
      }

      // Execute search
      const result = await orderHelpers.search_orders_optimized(args)

      // Format results
      const items = await Promise.all(
        result.items.map((item: any) => formatOrderStubOptimized(item)),
      )

      return this.success({
        item_counts: result.item_counts,
        items: items as any,
      }) as OrderSearchResponse
    } catch (error) {
      this.logError("searchOrders", error)
      this.handleError(error, "searchOrders")
    }
  }

  /**
   * Get contractor order metrics
   *
   * Retrieves order metrics for a specific contractor.
   * Requires membership in the contractor organization.
   *
   * @summary Get contractor metrics
   * @param request Express request
   * @param spectrum_id Contractor spectrum ID
   * @returns Contractor order metrics
   */
  @Get("contractor/{spectrum_id}/metrics")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getContractorMetrics(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
  ): Promise<OrderMetricsResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:read")) {
          throw new ForbiddenError("Insufficient permissions: orders:read scope required")
        }
      }

      // Get contractor
      const contractor = await contractorDb.getContractor({ spectrum_id })
      if (!contractor) {
        throw new NotFoundError("Invalid contractor")
      }

      // Check membership
      const contractors = await contractorDb.getUserContractors({
        "contractor_members.user_id": user.user_id,
      })

      if (
        !contractors.find((c) => c.contractor_id === contractor.contractor_id)
      ) {
        throw new ForbiddenError(
          "You are not authorized to view these metrics",
        )
      }

      // Get metrics
      const metrics = await orderHelpers.getContractorOrderMetrics(
        contractor.contractor_id,
      )

      return this.success(metrics)
    } catch (error) {
      this.logError("getContractorMetrics", error, { spectrum_id })
      this.handleError(error, "getContractorMetrics")
    }
  }

  /**
   * Get contractor order data
   *
   * Retrieves comprehensive order data for a contractor.
   * Requires contractor authorization.
   *
   * @summary Get contractor order data
   * @param request Express request
   * @param spectrum_id Contractor spectrum ID
   * @param include_trends Include trend data
   * @param assigned_only Only include assigned orders
   * @returns Contractor order data
   */
  @Get("contractor/{spectrum_id}/data")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getContractorOrderData(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
    @Query() include_trends?: boolean,
    @Query() assigned_only?: boolean,
  ): Promise<ContractorOrderDataResponse> {
    try {
      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:read")) {
          throw new ForbiddenError("Insufficient permissions: orders:read scope required")
        }
      }

      // Get contractor (org_authorized middleware would have set this)
      const contractor = await contractorDb.getContractor({ spectrum_id })
      if (!contractor) {
        throw new NotFoundError("Invalid contractor")
      }

      // Parse query parameters
      const includeTrends = include_trends ?? true
      const assignedOnly = assigned_only ?? false

      // Get comprehensive contractor order data
      const data = await orderHelpers.getContractorOrderData(
        contractor.contractor_id,
        {
          include_trends: includeTrends,
          assigned_only: assignedOnly,
        },
      )

      return this.success(data)
    } catch (error) {
      this.logError("getContractorOrderData", error, { spectrum_id })
      this.handleError(error, "getContractorOrderData")
    }
  }

  /**
   * Get user order data
   *
   * Retrieves order data for the authenticated user.
   *
   * @summary Get user order data
   * @param request Express request
   * @returns User order data
   */
  @Get("user/data")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getUserOrderData(
    @Request() request: ExpressRequest,
  ): Promise<UserOrderDataResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:read")) {
          throw new ForbiddenError("Insufficient permissions: orders:read scope required")
        }
      }

      // Get user orders
      const orders = await orderDb.getOrders({ customer_id: user.user_id })
      const formattedOrders = await Promise.all(
        orders.map((order: DBOrder) => formatOrderStubOptimized(order as any)),
      )

      // Calculate totals
      const totalSpent = orders
        .filter((o: DBOrder) => o.status === "fulfilled")
        .reduce((sum: number, o: DBOrder) => sum + parseFloat(o.cost.toString()), 0)
        .toString()

      return this.success({
        orders: formattedOrders as any,
        total_spent: totalSpent,
        total_orders: orders.length,
      })
    } catch (error) {
      this.logError("getUserOrderData", error)
      this.handleError(error, "getUserOrderData")
    }
  }

  /**
   * Get order by ID
   *
   * Retrieves detailed information about a specific order.
   * Requires authentication and authorization to view the order.
   *
   * @summary Get order by ID
   * @param request Express request
   * @param order_id Order ID
   * @returns Order details
   */
  @Get("{order_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getOrderById(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
  ): Promise<OrderResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:read")) {
          throw new ForbiddenError("Insufficient permissions: orders:read scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new NotFoundError("Invalid order")
      }

      // Check authorization
      const unrelated = !(await orderHelpers.is_related_to_order(order, user))
      if (unrelated) {
        throw new ForbiddenError("You are not authorized to view this order")
      }

      // Serialize order details
      const orderDetails = await serializeOrderDetails(
        order,
        null,
        true,
        true,
        true,
      )

      return this.success(orderDetails as any)
    } catch (error) {
      this.logError("getOrderById", error, { order_id })
      this.handleError(error, "getOrderById")
    }
  }

  /**
   * Create order
   *
   * Creates a new order.
   * Validates contractor, assignee, and permissions.
   *
   * @summary Create order
   * @param request Express request
   * @param payload Order creation data
   * @returns Created order session information
   */
  @Post("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Conflict")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createOrder(
    @Request() request: ExpressRequest,
    @Body() payload: CreateOrderPayload,
  ): Promise<CreateOrderResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Validate contractor
      let contractor_id: string | null = null
      if (payload.contractor) {
        const contractor_obj = await contractorDb.getContractor({
          spectrum_id: payload.contractor,
        })
        if (!contractor_obj) {
          throw new ValidationErrorClass("Invalid contractor")
        }
        if (contractor_obj.archived) {
          throw new ConflictError(
            "Cannot create orders for an archived contractor",
          )
        }
        contractor_id = contractor_obj.contractor_id
      }

      // Validate assignee
      let assigned_user = null
      if (payload.assigned_to) {
        assigned_user = await profileDb.getUser({
          username: payload.assigned_to,
        })
        if (!assigned_user) {
          throw new ValidationErrorClass("Invalid assignee")
        }

        if (contractor_id) {
          const role = await contractorDb.getContractorRoleLegacy(
            assigned_user.user_id,
            contractor_id,
          )
          if (!role) {
            throw new ValidationErrorClass("Invalid assignee")
          }
        }
      }

      // Check if customer is blocked
      const isBlocked = await profileDb.checkIfBlockedForOrder(
        user.user_id,
        contractor_id,
        assigned_user?.user_id || null,
        user.user_id,
      )
      if (isBlocked) {
        throw new ForbiddenError(
          "You are blocked from creating orders with this contractor or user",
        )
      }

      // Check availability requirement
      try {
        await orderHelpers.validateAvailabilityRequirement(
          user.user_id,
          contractor_id,
          assigned_user?.user_id || null,
        )
      } catch (error) {
        throw new ValidationErrorClass(
          error instanceof Error
            ? error.message
            : "Availability is required to submit this offer. Please set your availability first.",
        )
      }

      // Validate order limits
      try {
        await orderHelpers.validateOrderLimits(
          contractor_id,
          assigned_user?.user_id || null,
          0, // No market listings for service orders
          payload.cost,
        )
      } catch (error) {
        throw new ValidationErrorClass(
          error instanceof Error
            ? error.message
            : "Order does not meet size or value requirements",
        )
      }

      // Create offer
      const { session, discord_invite } = await orderHelpers.createOffer(
        {
          assigned_id: assigned_user?.user_id,
          contractor_id: contractor_id,
          customer_id: user.user_id,
        },
        {
          actor_id: user.user_id,
          kind: payload.kind,
          description: payload.description,
          cost: payload.cost,
          title: payload.title,
          collateral: payload.collateral || 0,
          service_id: payload.service_id,
          payment_type: payload.payment_type,
        },
      )

      return this.success({
        discord_invite: discord_invite,
        session_id: session.id,
      })
    } catch (error) {
      this.logError("createOrder", error, { payload })
      this.handleError(error, "createOrder")
    }
  }

  /**
   * Update order
   *
   * Updates an existing order.
   * Can update status, assigned user, or contractor.
   *
   * @summary Update order
   * @param request Express request
   * @param order_id Order ID
   * @param payload Update data
   * @returns Success response
   */
  @Put("{order_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateOrder(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
    @Body() payload: UpdateOrderPayload,
  ): Promise<SuccessResponse> {
    try {
      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new NotFoundError("Invalid order")
      }

      // Attach order to request for middleware compatibility
      ;(request as any).order = order

      // Execute operations
      if (payload.status) {
        await orderHelpers.handleStatusUpdate(
          request as any,
          { headersSent: false } as any,
          payload.status,
        )
      }

      if (
        payload.assigned_to !== undefined ||
        payload.contractor !== undefined
      ) {
        // Prepare request body for handleAssignedUpdate
        ;(request as any).body = {
          assigned_to: payload.assigned_to,
          contractor: payload.contractor,
        }
        await orderHelpers.handleAssignedUpdate(
          request as any,
          { headersSent: false } as any,
        )
      }

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("updateOrder", error, { order_id, payload })
      this.handleError(error, "updateOrder")
    }
  }

  /**
   * Apply to order
   *
   * Apply to an order as a user or on behalf of a contractor.
   *
   * @summary Apply to order
   * @param request Express request
   * @param order_id Order ID
   * @param payload Application data
   * @returns Success response
   */
  @Post("{order_id}/applicants")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Conflict")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async applyToOrder(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
    @Body() payload: ApplyToOrderPayload,
  ): Promise<SuccessResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new ValidationErrorClass("Invalid order")
      }

      if (order.assigned_id || order.contractor_id) {
        throw new ConflictError("Order is already assigned")
      }

      if (!payload.contractor) {
        // User application
        const apps = await orderDb.getOrderApplicants({
          user_applicant_id: user.user_id,
          order_id: order.order_id,
        })
        if (apps.length > 0) {
          throw new ConflictError("You have already applied to this order")
        }

        await orderDb.createOrderApplication({
          order_id: order.order_id,
          user_applicant_id: user.user_id,
          message: payload.message || "",
        })
      } else {
        // Contractor application
        const contractor_obj = await contractorDb.getContractor({
          spectrum_id: payload.contractor,
        })
        if (!contractor_obj) {
          throw new ValidationErrorClass("Invalid contractor")
        }

        if (contractor_obj.archived) {
          throw new ConflictError(
            "Cannot apply on behalf of an archived contractor",
          )
        }

        if (
          !(await has_permission(
            contractor_obj.contractor_id,
            user.user_id,
            "manage_orders",
          ))
        ) {
          throw new ForbiddenError(
            "You are not authorized to apply to this order",
          )
        }

        const apps = await orderDb.getOrderApplicants({
          org_applicant_id: contractor_obj.contractor_id,
          order_id: order.order_id,
        })
        if (apps.length > 0) {
          throw new ConflictError("You have already applied to this order")
        }

        await orderDb.createOrderApplication({
          order_id: order.order_id,
          org_applicant_id: contractor_obj.contractor_id,
          message: payload.message || "",
        })
      }

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("applyToOrder", error, { order_id, payload })
      this.handleError(error, "applyToOrder")
    }
  }

  /**
   * Accept contractor applicant
   *
   * Accept a contractor's application to an order.
   * Requires order ownership.
   *
   * @summary Accept contractor applicant
   * @param request Express request
   * @param order_id Order ID
   * @param spectrum_id Contractor spectrum ID
   * @returns Success response
   */
  @Post("{order_id}/applicants/contractors/{spectrum_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async acceptContractorApplicant(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
    @Path() spectrum_id: string,
  ): Promise<SuccessResponse> {
    try {
      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new NotFoundError("Invalid order")
      }

      // Attach order to request for middleware compatibility
      ;(request as any).order = order
      ;(request as any).params = { spectrum_id }

      await orderHelpers.acceptApplicant(
        request as any,
        { headersSent: false } as any,
        { target_contractor: spectrum_id },
      )

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("acceptContractorApplicant", error, {
        order_id,
        spectrum_id,
      })
      this.handleError(error, "acceptContractorApplicant")
    }
  }

  /**
   * Accept user applicant
   *
   * Accept a user's application to an order.
   * Requires order ownership.
   *
   * @summary Accept user applicant
   * @param request Express request
   * @param order_id Order ID
   * @param username User username
   * @returns Success response
   */
  @Post("{order_id}/applicants/users/{username}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async acceptUserApplicant(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
    @Path() username: string,
  ): Promise<SuccessResponse> {
    try {
      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new NotFoundError("Invalid order")
      }

      // Attach order to request for middleware compatibility
      ;(request as any).order = order
      ;(request as any).params = { username }

      await orderHelpers.acceptApplicant(
        request as any,
        { headersSent: false } as any,
        { target_username: username },
      )

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("acceptUserApplicant", error, { order_id, username })
      this.handleError(error, "acceptUserApplicant")
    }
  }

  /**
   * Create order thread
   *
   * Creates a Discord thread for an order.
   * Requires order ownership.
   *
   * @summary Create order thread
   * @param request Express request
   * @param order_id Order ID
   * @returns Success response
   */
  @Post("{order_id}/thread")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<Conflict>(409, "Conflict")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createOrderThread(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
  ): Promise<SuccessResponse> {
    try {
      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "orders:write")) {
          throw new ForbiddenError("Insufficient permissions: orders:write scope required")
        }
      }

      // Get order
      const order = await orderDb.getOrder({ order_id })
      if (!order) {
        throw new NotFoundError("Invalid order")
      }

      if (order.thread_id) {
        throw new ConflictError("Order already has a thread!")
      }

      // Queue thread creation
      const result = await discordService.queueThreadCreation(order)
      if (result.status === "failed") {
        this.logError("createOrderThread", result)
        throw new Error(result.message)
      }

      this.logInfo(
        "createOrderThread",
        `Thread creation queued successfully for order ${order.order_id}. Thread will be created asynchronously.`,
      )

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("createOrderThread", error, { order_id })
      this.handleError(error, "createOrderThread")
    }
  }
}
