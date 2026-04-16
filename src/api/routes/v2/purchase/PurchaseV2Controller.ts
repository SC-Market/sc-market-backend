/**
 * Purchase V2 Controller
 *
 * TSOA controller for V2 market listing purchases.
 * Creates orders in V1 orders table with V2-specific validation and stock allocation.
 */

import {
  Controller,
  Post,
  Route,
  Tags,
  Body,
  Security,
  Request,
  SuccessResponse,
} from "tsoa";
import { PurchaseService, PurchaseRequest, PurchaseResponse } from "../../../../services/market-v2/purchase.service.js";

interface AuthenticatedRequest extends Express.Request {
  user?: {
    userId: string;
    username: string;
  };
}

@Route("api/v2/purchase")
@Tags("Purchase V2")
export class PurchaseV2Controller extends Controller {
  private purchaseService: PurchaseService;

  constructor() {
    super();
    this.purchaseService = new PurchaseService();
  }

  /**
   * Purchase V2 market listings with variant support
   * Creates an offer session (not a direct order)
   * @summary Purchase items
   */
  @Post()
  @Security("jwt")
  @SuccessResponse("201", "Offer created successfully")
  public async purchaseItems(
    @Body() requestBody: PurchaseRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<PurchaseResponse> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    this.setStatus(201);
    return await this.purchaseService.purchaseItems(userId, requestBody);
  }
}
