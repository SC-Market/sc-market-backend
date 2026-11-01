import type { Knex } from "knex"

/**
 * Branded storefront enquiries and the storefront directory setting
 * (drafts/whitelabel-overhaul-plan.md §A11).
 *
 * storefront_enquiries: an org (Manage Org Details) or a shop (its managers)
 * asks staff for a branded storefront on <name>.sc-market.space. Exactly one
 * target (org or shop). At most one open enquiry per target (partial unique
 * index; the API answers 409 first). No contact details are stored: the
 * Discord handle is read from the submitter's linked Discord when staff look
 * at it, so account deletion only has to clear submitted_by (anonymized,
 * the request stays). The message is staff-only.
 *
 * storefront_directory_hidden: one row per org or shop whose owners turned
 * off "Show in the public storefront directory" (a row = hidden; no row =
 * the default, shown when it has public content). A separate table so no hot
 * table (contractors, shops) is altered.
 *
 * notification_actions: storefront_enquiry_created, the in-app notification
 * site admins get for a new enquiry (entity storefront_enquiries).
 *
 * New, empty tables; lock_timeout so the FKs' brief locks never queue behind
 * traffic. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS storefront_enquiries (
      enquiry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type TEXT NOT NULL CHECK (target_type IN ('org', 'shop')),
      contractor_id UUID REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      shop_id UUID REFERENCES shops(shop_id) ON DELETE CASCADE,
      submitted_by UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      contact_method TEXT NOT NULL CHECK (contact_method IN ('discord', 'site_message')),
      requested_subdomain TEXT NOT NULL CHECK (requested_subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
      message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'completed', 'declined')),
      staff_note TEXT CHECK (staff_note IS NULL OR char_length(staff_note) <= 1000),
      handled_by UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT storefront_enquiries_one_target CHECK (
        (target_type = 'org' AND contractor_id IS NOT NULL AND shop_id IS NULL) OR
        (target_type = 'shop' AND shop_id IS NOT NULL AND contractor_id IS NULL)
      )
    )
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS storefront_enquiries_one_open_per_target
      ON storefront_enquiries (target_type, COALESCE(contractor_id, shop_id))
      WHERE status IN ('open', 'in_progress')
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS storefront_enquiries_target_idx
      ON storefront_enquiries (COALESCE(contractor_id, shop_id), created_at DESC)
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS storefront_enquiries_status_idx
      ON storefront_enquiries (status, created_at DESC)
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS storefront_enquiries_submitted_by_idx
      ON storefront_enquiries (submitted_by) WHERE submitted_by IS NOT NULL
  `)

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS storefront_directory_hidden (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id UUID UNIQUE REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      shop_id UUID UNIQUE REFERENCES shops(shop_id) ON DELETE CASCADE,
      updated_by UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT storefront_directory_hidden_one_target
        CHECK (num_nonnulls(contractor_id, shop_id) = 1)
    )
  `)

  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'storefront_enquiry_created', 'storefront_enquiries'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'storefront_enquiry_created')
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  for (const table of ["notification", "notification_change"]) {
    await knex.raw(`
      DELETE FROM ${table}
      WHERE notification_object_id IN (
        SELECT o.notification_object_id FROM notification_object o
        JOIN notification_actions a ON a.action_type_id = o.action_type_id
        WHERE a.action = 'storefront_enquiry_created'
      )
    `)
  }
  await knex.raw(`
    DELETE FROM notification_object
    WHERE action_type_id IN (SELECT action_type_id FROM notification_actions WHERE action = 'storefront_enquiry_created')
  `)
  await knex.raw(`DELETE FROM notification_actions WHERE action = 'storefront_enquiry_created'`)
  await knex.raw("DROP TABLE IF EXISTS storefront_directory_hidden")
  await knex.raw("DROP TABLE IF EXISTS storefront_enquiries")
}
