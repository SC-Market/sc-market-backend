/**
 * Offer-related database operations.
 * This module contains all database queries specific to offers,
 * offer sessions, and related functionality.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBOffer,
  DBOfferSession,
} from "../../../../clients/database/db-models.js"
import { DBContractOffer } from "../contracts/types.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get offer sessions by where clause.
 */
export async function getOfferSessions(
  where: Partial<DBOfferSession>,
): Promise<DBOfferSession[]> {
  return knex()<DBOfferSession>("offer_sessions").where(where).select()
}

/**
 * Update an offer session.
 */
export async function updateOfferSession(
  id: string,
  data: Partial<DBOfferSession>,
): Promise<DBOfferSession[]> {
  return knex()<DBOfferSession>("offer_sessions")
    .where({ id })
    .update(data)
    .returning("*")
}

/**
 * Create an order offer session.
 */
export async function createOrderOfferSession(
  data: Partial<
    Omit<DBOfferSession, "timestamp"> & { timestamp: string | Date }
  >,
  trx?: any,
): Promise<DBOfferSession[]> {
  if (trx) {
    return trx("offer_sessions").insert(data as DBOfferSession).returning("*")
  }
  return knex()<DBOfferSession>("offer_sessions")
    .insert(data as DBOfferSession)
    .returning("*")
}

/**
 * Get order offers by where clause.
 */
export async function getOrderOffers(
  where: Partial<DBOffer>,
): Promise<DBOffer[]> {
  return knex()<DBOffer>("order_offers")
    .where(where)
    .orderBy("timestamp", "desc")
    .select()
}

/**
 * Get the most recent order offer for a session.
 */
export async function getMostRecentOrderOffer(id: string): Promise<DBOffer> {
  const res = await knex()<DBOffer>("order_offers")
    .where({ session_id: id })
    .orderBy("timestamp", "desc")
    .first()

  return res!
}

/**
 * Create an order offer.
 */
export async function createOrderOffer(
  data: Partial<Omit<DBOffer, "timestamp"> & { timestamp: string | Date }>,
  trx?: any,
): Promise<DBOffer[]> {
  if (trx) {
    return trx("order_offers").insert(data as DBOffer).returning("*")
  }
  return knex()<DBOffer>("order_offers")
    .insert(data as DBOffer)
    .returning("*")
}

/**
 * Update an order offer.
 */
export async function updateOrderOffer(
  id: string,
  data: Partial<DBOffer>,
): Promise<DBOffer[]> {
  return knex()<DBOffer>("order_offers")
    .where({ id })
    .update(data)
    .returning("*")
}

/**
 * Update an offer (alias for updateOrderOffer for backward compatibility).
 */
export async function updateOffer(
  id: string,
  data: Partial<DBOffer>,
): Promise<DBOffer[]> {
  return updateOrderOffer(id, data)
}

/**
 * Get contract offers by where clause.
 */
export async function getContractOffers(
  where: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers").where(where).select()
}

/**
 * Delete contract offers.
 */
export async function deleteContractOffers(
  where: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Update contract offers.
 */
export async function updateContractOffers(
  where: Partial<DBContractOffer>,
  data: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers")
    .where(where)
    .update(data)
    .returning("*")
}

/**
 * Insert contract offers.
 */
export async function insertContractOffers(
  data: Partial<DBContractOffer> | Partial<DBContractOffer>[],
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers")
    .insert(data)
    .returning("*")
}

/**
 * Get related offers for a user (customer or assigned).
 */
export async function getRelatedOffers(c: string): Promise<DBOfferSession[]> {
  return knex()<DBOfferSession>("offer_sessions")
    .where({ customer_id: c })
    .orWhere({ assigned_id: c })
    .select()
}
