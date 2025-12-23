/**
 * Ship-related database operations.
 * This module contains all database queries specific to ships.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBShip } from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get ships by where clause.
 */
export async function getShips(where: any): Promise<DBShip[]> {
  return knex()<DBShip>("ships").where(where).select()
}

/**
 * Get a single ship by where clause.
 */
export async function getShip(where: any): Promise<DBShip | undefined> {
  return knex()<DBShip>("ships").where(where).first()
}

/**
 * Create a new ship.
 */
export async function createShip(body: any): Promise<DBShip[]> {
  return knex()<DBShip>("ships").insert(body).returning("*")
}
