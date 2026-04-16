/**
 * Cart V2 Controller
 *
 * TSOA controller for Market V2 cart operations.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Body,
  Path,
  Security,
  Request,
  SuccessResponse,
} from "tsoa";
import { CartService } from "../../../../services/market-v2/cart.service.js";
import {
  CartDetailV2,
  CartItemV2,
  AddToCartRequest,
  UpdateCartItemRequest,
  UpdateCartNotesRequest,
  CheckoutCartRequest,
  CheckoutCartResponse,
} from "../types/market-v2-types.js";

interface AuthenticatedRequest extends Express.Request {
  user?: {
    userId: string;
    username: string;
  };
}

@Route("api/v2/cart")
@Tags("Cart V2")
export class CartV2Controller extends Controller {
  private cartService: CartService;

  constructor() {
    super();
    this.cartService = new CartService();
  }

  /**
   * Get current user's cart with variant details
   * @summary Get cart
   */
  @Get()
  @Security("jwt")
  @SuccessResponse("200", "Cart retrieved successfully")
  public async getCart(@Request() request: AuthenticatedRequest): Promise<CartDetailV2> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    return await this.cartService.getCart(userId);
  }

  /**
   * Add item to cart with variant selection
   * @summary Add to cart
   */
  @Post("add")
  @Security("jwt")
  @SuccessResponse("201", "Item added to cart")
  public async addToCart(
    @Body() requestBody: AddToCartRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<CartItemV2> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    this.setStatus(201);
    return await this.cartService.addToCart(
      userId,
      requestBody.listing_id,
      requestBody.variant_id,
      requestBody.quantity
    );
  }

  /**
   * Update cart item quantity
   * @summary Update cart item
   */
  @Put("{cart_item_id}")
  @Security("jwt")
  @SuccessResponse("200", "Cart item updated")
  public async updateCartItem(
    @Path() cart_item_id: string,
    @Body() requestBody: UpdateCartItemRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<CartItemV2> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    return await this.cartService.updateCartItem(userId, cart_item_id, requestBody.quantity);
  }

  /**
   * Remove item from cart
   * @summary Remove from cart
   */
  @Delete("{cart_item_id}")
  @Security("jwt")
  @SuccessResponse("204", "Item removed from cart")
  public async removeFromCart(
    @Path() cart_item_id: string,
    @Request() request: AuthenticatedRequest
  ): Promise<void> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.cartService.removeFromCart(userId, cart_item_id);
    this.setStatus(204);
  }

  /**
   * Update buyer notes for a seller's cart items
   * @summary Update cart notes
   */
  @Put("notes")
  @Security("jwt")
  @SuccessResponse("200", "Notes updated successfully")
  public async updateCartNotes(
    @Body() requestBody: UpdateCartNotesRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<void> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.cartService.updateCartNotes(userId, requestBody.seller_id, requestBody.buyer_note);
  }

  /**
   * Clear cart for a specific seller
   * @summary Clear seller cart
   */
  @Delete("seller/{seller_id}")
  @Security("jwt")
  @SuccessResponse("204", "Seller cart cleared")
  public async clearCartForSeller(
    @Path() seller_id: string,
    @Request() request: AuthenticatedRequest
  ): Promise<void> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.cartService.clearCartForSeller(userId, seller_id);
    this.setStatus(204);
  }

  /**
   * Checkout cart for a specific seller and create order
   * @summary Checkout cart
   */
  @Post("checkout")
  @Security("jwt")
  @SuccessResponse("200", "Checkout completed")
  public async checkoutCart(
    @Body() requestBody: CheckoutCartRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<CheckoutCartResponse> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const result = await this.cartService.checkoutCart(userId, requestBody);

    // Get full order details
    const OrdersService = (await import("../../../../services/market-v2/orders.service.js")).OrdersService;
    const ordersService = new OrdersService();
    const orderDetails = await ordersService.getOrderDetail(result.order_id, userId);

    return {
      order_id: result.order_id,
      session_id: result.session_id,
      discord_invite: result.discord_invite,
      order_details: orderDetails,
      items_removed: result.items_removed,
      price_changes: result.price_changes,
    };
  }
}
