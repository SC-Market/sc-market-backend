#!/usr/bin/env tsx
import Knex from "knex"
import * as dotenv from "dotenv"

dotenv.config()

const dbConfig = JSON.parse(process.env.DATABASE_PASS || "{}")

const knex = Knex({
  client: "pg",
  connection: {
    host: dbConfig.host || "localhost",
    user: dbConfig.username || "postgres",
    password: dbConfig.password || "",
    database: dbConfig.dbname || "postgres",
    port: dbConfig.port || 5432,
  },
})

async function main() {
  const variants = await knex("item_variants")
    .select("*")
    .orderBy("created_at", "desc")
    .limit(10)

  console.log("Recent variants:")
  console.log(JSON.stringify(variants, null, 2))

  await knex.destroy()
}

main()
