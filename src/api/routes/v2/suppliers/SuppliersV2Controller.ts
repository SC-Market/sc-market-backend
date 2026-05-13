/**
 * Suppliers V2 Controller
 *
 * Manages supplier roster relationships — aggregators maintaining a list of
 * trusted suppliers (users or contractor orgs) with tier and status tracking.
 *
 * Routes:
 *   GET    /suppliers         — list my suppliers (as aggregator)
 *   POST   /suppliers         — add a supplier to my roster
 *   PATCH  /suppliers/:id     — update tier / notes / status
 *   DELETE /suppliers/:id     — remove from roster (sets status = 'removed')
 *   GET    /suppliers/as-supplier — orders where I am the supplier
 */

import { Get, Post, Patch, Delete, Route, Tags, Body, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  AddSupplierRequest,
  AddSupplierResponse,
  UpdateSupplierRequest,
  UpdateSupplierResponse,
  GetSuppliersResponse,
  SupplierRelationship,
  SupplierEntityInfo,
} from "../types/suppliers.types.js"

@Route("suppliers")
@Tags("Suppliers V2")
@Security("loggedin")
export class SuppliersV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  // ---------------------------------------------------------------------------
  // List my supplier roster
  // ---------------------------------------------------------------------------

  @Get()
  public async getMySuppliers(
    @Request() request: ExpressRequest,
    @Query() status?: "active" | "suspended" | "removed",
    @Query() tier?: "preferred" | "approved" | "restricted",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<GetSuppliersResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()
    const p = Math.max(1, page || 1)
    const ps = Math.min(100, Math.max(1, page_size || 50))

    // Aggregator may be acting as a user or as a contractor org they manage
    const contractorIds = await this.getUserContractorIds(userId)

    let query = knex("supplier_relationships as sr").where((qb) => {
      qb.where("sr.aggregator_id", userId)
      if (contractorIds.length) qb.orWhereIn("sr.aggregator_contractor_id", contractorIds)
    })

    if (status) query = query.where("sr.status", status)
    if (tier)   query = query.where("sr.tier", tier)

    const [{ count }] = await query.clone().count("* as count")
    const total = parseInt(String(count), 10)

    const rows = await query
      .select("sr.*")
      .orderBy("sr.created_at", "desc")
      .limit(ps).offset((p - 1) * ps)

    const suppliers = await Promise.all(rows.map((r: any) => this.serializeRelationship(r)))

    return { suppliers, total, page: p, page_size: ps }
  }

  // ---------------------------------------------------------------------------
  // Add a supplier
  // ---------------------------------------------------------------------------

  @Post()
  public async addSupplier(
    @Body() body: AddSupplierRequest,
    @Request() request: ExpressRequest,
  ): Promise<AddSupplierResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    // Validate: exactly one supplier side
    if (!body.supplier_id && !body.supplier_contractor_id) {
      throw this.throwValidationError("Must specify supplier_id or supplier_contractor_id", [
        { field: "supplier_id", message: "One of supplier_id or supplier_contractor_id is required" },
      ])
    }
    if (body.supplier_id && body.supplier_contractor_id) {
      throw this.throwValidationError("Specify only one of supplier_id or supplier_contractor_id", [
        { field: "supplier_id", message: "Cannot specify both supplier_id and supplier_contractor_id" },
      ])
    }

    // Prevent self-relationship
    if (body.supplier_id === userId) {
      throw this.throwValidationError("Cannot add yourself as a supplier", [
        { field: "supplier_id", message: "Cannot add yourself as a supplier" },
      ])
    }

    // Verify the supplier entity exists
    if (body.supplier_id) {
      const user = await knex("accounts").where({ user_id: body.supplier_id }).first()
      if (!user) throw this.throwNotFound("User", body.supplier_id)
    } else if (body.supplier_contractor_id) {
      const org = await knex("contractors").where({ contractor_id: body.supplier_contractor_id }).first()
      if (!org) throw this.throwNotFound("Contractor", body.supplier_contractor_id!)
    }

    const [row] = await knex("supplier_relationships").insert({
      aggregator_id: userId,
      aggregator_contractor_id: null,
      supplier_id: body.supplier_id || null,
      supplier_contractor_id: body.supplier_contractor_id || null,
      tier: body.tier || null,
      notes: body.notes || null,
      status: "active",
    }).returning("*")

    return { relationship: await this.serializeRelationship(row) }
  }

  // ---------------------------------------------------------------------------
  // Update supplier tier / notes / status
  // ---------------------------------------------------------------------------

  @Patch("{relationshipId}")
  public async updateSupplier(
    @Path() relationshipId: string,
    @Body() body: UpdateSupplierRequest,
    @Request() request: ExpressRequest,
  ): Promise<UpdateSupplierResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const rel = await knex("supplier_relationships").where({ relationship_id: relationshipId }).first()
    if (!rel) throw this.throwNotFound("Supplier relationship", relationshipId)
    await this.assertAggregatorAccess(rel, userId)

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (body.tier  !== undefined) updates.tier   = body.tier
    if (body.notes !== undefined) updates.notes  = body.notes
    if (body.status !== undefined) updates.status = body.status

    const [updated] = await knex("supplier_relationships")
      .where({ relationship_id: relationshipId })
      .update(updates)
      .returning("*")

    return { relationship: await this.serializeRelationship(updated) }
  }

  // ---------------------------------------------------------------------------
  // Remove supplier (hard delete)
  // ---------------------------------------------------------------------------

  @Delete("{relationshipId}")
  public async removeSupplier(
    @Path() relationshipId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const rel = await knex("supplier_relationships").where({ relationship_id: relationshipId }).first()
    if (!rel) throw this.throwNotFound("Supplier relationship", relationshipId)
    await this.assertAggregatorAccess(rel, userId)

    await knex("supplier_relationships").where({ relationship_id: relationshipId }).delete()

    return { success: true }
  }

  // ---------------------------------------------------------------------------
  // View roster entries where I am the supplier
  // ---------------------------------------------------------------------------

  @Get("as-supplier")
  public async getMyAggregators(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<GetSuppliersResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()
    const p = Math.max(1, page || 1)
    const ps = Math.min(100, Math.max(1, page_size || 50))

    const contractorIds = await this.getUserContractorIds(userId)

    let query = knex("supplier_relationships as sr").where((qb) => {
      qb.where("sr.supplier_id", userId)
      if (contractorIds.length) qb.orWhereIn("sr.supplier_contractor_id", contractorIds)
    }).where("sr.status", "active")

    const [{ count }] = await query.clone().count("* as count")
    const total = parseInt(String(count), 10)

    const rows = await query.select("sr.*").orderBy("sr.created_at", "desc").limit(ps).offset((p - 1) * ps)
    const suppliers = await Promise.all(rows.map((r: any) => this.serializeRelationship(r)))

    return { suppliers, total, page: p, page_size: ps }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getUserContractorIds(userId: string): Promise<string[]> {
    const rows = await getKnex()("contractor_members").where({ user_id: userId }).select("contractor_id")
    return rows.map((r: any) => r.contractor_id)
  }

  private async assertAggregatorAccess(rel: any, userId: string): Promise<void> {
    if (rel.aggregator_id === userId) return
    if (rel.aggregator_contractor_id) {
      const member = await getKnex()("contractor_members")
        .where({ contractor_id: rel.aggregator_contractor_id, user_id: userId })
        .first()
      if (member) return
    }
    throw this.throwForbidden("Not authorized to modify this supplier relationship")
  }

  private async serializeRelationship(row: any): Promise<SupplierRelationship> {
    const knex = getKnex()

    // Aggregator side
    let aggregator: SupplierEntityInfo
    if (row.aggregator_id) {
      const u = await knex("accounts").where({ user_id: row.aggregator_id }).first()
      aggregator = {
        id: row.aggregator_id,
        username: u?.username || "unknown",
        display_name: u?.display_name || u?.username || "Unknown",
        avatar: u?.avatar || null,
        kind: "user",
      }
    } else {
      const c = await knex("contractors").where({ contractor_id: row.aggregator_contractor_id }).first()
      aggregator = {
        id: row.aggregator_contractor_id,
        username: c?.spectrum_id || "unknown",
        display_name: c?.name || "Unknown Org",
        avatar: c?.avatar || null,
        kind: "contractor",
        spectrum_id: c?.spectrum_id,
      }
    }

    // Supplier side
    let supplier: SupplierEntityInfo
    if (row.supplier_id) {
      const u = await knex("accounts").where({ user_id: row.supplier_id }).first()
      supplier = {
        id: row.supplier_id,
        username: u?.username || "unknown",
        display_name: u?.display_name || u?.username || "Unknown",
        avatar: u?.avatar || null,
        kind: "user",
      }
    } else {
      const c = await knex("contractors").where({ contractor_id: row.supplier_contractor_id }).first()
      supplier = {
        id: row.supplier_contractor_id,
        username: c?.spectrum_id || "unknown",
        display_name: c?.name || "Unknown Org",
        avatar: c?.avatar || null,
        kind: "contractor",
        spectrum_id: c?.spectrum_id,
      }
    }

    return {
      relationship_id: row.relationship_id,
      aggregator,
      supplier,
      tier: row.tier || null,
      notes: row.notes || null,
      status: row.status,
      created_at: row.created_at?.toISOString?.() || new Date().toISOString(),
      updated_at: row.updated_at?.toISOString?.() || new Date().toISOString(),
    }
  }
}
