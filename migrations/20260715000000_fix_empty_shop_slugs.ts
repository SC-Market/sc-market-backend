import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Find shops with empty slugs and generate one from their name
  const emptySlugShops = await knex("shops").where("slug", "").select("shop_id", "name")

  for (const shop of emptySlugShops) {
    let slug = shop.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 45)

    if (!slug) slug = `shop-${shop.shop_id.slice(0, 8)}`

    // Check uniqueness
    const existing = await knex("shops").whereRaw("LOWER(slug) = ?", [slug]).whereNot("shop_id", shop.shop_id).first()
    if (existing) {
      slug = `${slug.slice(0, 42)}-${shop.shop_id.slice(0, 4)}`
    }

    await knex("shops").where("shop_id", shop.shop_id).update({ slug })
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op
}
