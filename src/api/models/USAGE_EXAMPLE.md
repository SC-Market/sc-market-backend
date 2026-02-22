# TSOA Models Usage Example

This document demonstrates how to use the common models in TSOA controllers.

## Purpose

The models in `common.models.ts` are TypeScript type definitions that TSOA uses to:
1. Generate accurate OpenAPI/Swagger documentation
2. Provide type safety in controller method signatures
3. Ensure response formats match the legacy system

## Example Controller

```typescript
import { Controller, Get, Post, Route, Body, Path, Response, SuccessResponse } from "tsoa"
import { BaseController } from "./base.controller.js"
import {
  ApiResponse,
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/index.js"
import { createResponse } from "../routes/v1/util/response.js"

interface Item {
  id: string
  name: string
  price: number
}

interface CreateItemPayload {
  name: string
  price: number
}

@Route("api/v1/items")
export class ItemsController extends BaseController {
  /**
   * Get all items
   * @summary Retrieve all items
   */
  @Get()
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getItems(): Promise<ApiResponse<{ items: Item[] }>> {
    try {
      const items = await fetchItemsFromDatabase()
      // Use the legacy utility function to create the response
      return createResponse({ items })
    } catch (error) {
      this.handleError(error, "getItems")
    }
  }

  /**
   * Get item by ID
   * @summary Retrieve a specific item
   */
  @Get("{id}")
  @Response<NotFound>(404, "Item not found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getItem(
    @Path() id: string
  ): Promise<ApiResponse<{ item: Item }>> {
    try {
      const item = await fetchItemById(id)
      if (!item) {
        throw new NotFoundError("Item", id)
      }
      return createResponse({ item })
    } catch (error) {
      this.handleError(error, "getItem")
    }
  }

  /**
   * Create a new item
   * @summary Create an item
   */
  @Post()
  @SuccessResponse(201, "Created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Item already exists")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createItem(
    @Body() payload: CreateItemPayload
  ): Promise<ApiResponse<{ item: Item }>> {
    try {
      const item = await createItemInDatabase(payload)
      return createResponse({ item })
    } catch (error) {
      this.handleError(error, "createItem")
    }
  }
}
```

## Key Points

1. **Type Definitions**: The models define the TypeScript types for responses
2. **OpenAPI Generation**: TSOA uses these types to generate accurate OpenAPI specs
3. **Response Creation**: Use the legacy utility functions (`createResponse`, `createErrorResponse`) to create actual responses
4. **Error Handling**: The `BaseController.handleError` method throws errors that match these types
5. **Backward Compatibility**: The types match the legacy response format exactly

## Response Decorators

Use the `@Response` decorator to document all possible error responses:

```typescript
@Response<ValidationErrorResponse>(400, "Validation Error")
@Response<Unauthorized>(401, "Unauthorized")
@Response<Forbidden>(403, "Forbidden")
@Response<NotFound>(404, "Not found")
@Response<Conflict>(409, "Conflict")
@Response<ErrorResponse>(500, "Internal Server Error")
```

This ensures the OpenAPI spec documents all possible responses for each endpoint.

## Success Response

The return type of the controller method defines the success response:

```typescript
public async getItems(): Promise<ApiResponse<{ items: Item[] }>>
```

TSOA will generate OpenAPI documentation showing:
- Status: 200 OK
- Response body: `{ "data": { "items": [...] } }`

## Validation

TSOA automatically validates request bodies against the TypeScript types. If validation fails, it returns a `ValidationErrorResponse` (400) with details about which fields failed validation.
