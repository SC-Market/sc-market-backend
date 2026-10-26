import type { Knex } from "knex"

/**
 * Test accounts (docs/testing-with-test-accounts.md).
 *
 * Dedicated accounts that automated agents sign into with username + TOTP
 * (POST /api/auth/test-login). They live in a separate "test realm": nothing
 * they make is shown to real users, and test and real parties can never be on
 * the same order, offer, chat or org.
 *
 * The application enforces the rules with clear errors
 * (src/services/test-accounts/isolation.ts); this migration is the backstop:
 *
 * - accounts.is_test, contractors.is_test, shops.is_test (default false).
 *   accounts.is_test and contractors.is_test cannot change after insert.
 *   shops.is_test is derived from the owner on insert and an ownership change
 *   to an owner of the other realm is refused.
 * - CHECK: a test account's role is always 'user' (never admin or any other
 *   site role).
 * - Triggers refuse rows mixing realms on orders, offer_sessions,
 *   contractor_members and chat_participants (SQLSTATE SCT01, mapped to a 403
 *   by the error handler).
 * - test_login_events: an audit row for every test-login attempt. Never the
 *   code.
 *
 * Additive: every existing row is real (false) and passes every check.
 *
 * Idempotent: an older image's entrypoint deletes knex_migrations rows whose
 * file it doesn't have, so a later deploy can run this again over its own
 * objects. Every statement tolerates that.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE contractors ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_test_account_is_user') THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_test_account_is_user
          CHECK (NOT is_test OR role = 'user');
      END IF;
    END $$;

    -- Tiny partial indexes: the public-surface filters anti-join against them.
    CREATE INDEX IF NOT EXISTS idx_accounts_is_test ON accounts (user_id) WHERE is_test;
    CREATE INDEX IF NOT EXISTS idx_contractors_is_test ON contractors (contractor_id) WHERE is_test;
    CREATE INDEX IF NOT EXISTS idx_shops_is_test ON shops (shop_id) WHERE is_test;
  `)

  await knex.raw(`
    CREATE OR REPLACE FUNCTION scm_test_isolation_violation(what text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'test_account_isolation: %', what
        USING ERRCODE = 'SCT01',
              HINT = 'Test accounts can only interact with other test accounts.';
    END $$;

    -- True when the given parties include both test and real ones.
    CREATE OR REPLACE FUNCTION scm_is_mixed_realm(p_users uuid[], p_contractors uuid[], p_shops uuid[])
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT count(DISTINCT t) > 1 FROM (
        SELECT is_test AS t FROM accounts WHERE user_id = ANY (p_users)
        UNION ALL
        SELECT is_test FROM contractors WHERE contractor_id = ANY (p_contractors)
        UNION ALL
        SELECT is_test FROM shops WHERE shop_id = ANY (p_shops)
      ) parties
    $$;

    CREATE OR REPLACE FUNCTION scm_test_flag_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
        PERFORM scm_test_isolation_violation(TG_TABLE_NAME || '.is_test cannot change');
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS trg_accounts_test_flag_immutable ON accounts;
    CREATE TRIGGER trg_accounts_test_flag_immutable
      BEFORE UPDATE OF is_test ON accounts
      FOR EACH ROW EXECUTE FUNCTION scm_test_flag_immutable();
    DROP TRIGGER IF EXISTS trg_contractors_test_flag_immutable ON contractors;
    CREATE TRIGGER trg_contractors_test_flag_immutable
      BEFORE UPDATE OF is_test ON contractors
      FOR EACH ROW EXECUTE FUNCTION scm_test_flag_immutable();

    -- A shop is test exactly when its owner is.
    CREATE OR REPLACE FUNCTION scm_shops_test_realm() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE owner_is_test boolean;
    BEGIN
      IF NEW.owner_user_id IS NOT NULL THEN
        SELECT is_test INTO owner_is_test FROM accounts WHERE user_id = NEW.owner_user_id;
      ELSIF NEW.owner_contractor_id IS NOT NULL THEN
        SELECT is_test INTO owner_is_test FROM contractors WHERE contractor_id = NEW.owner_contractor_id;
      END IF;
      owner_is_test := COALESCE(owner_is_test, false);
      IF TG_OP = 'INSERT' THEN
        NEW.is_test := owner_is_test OR COALESCE(NEW.is_test, false);
        IF NEW.is_test AND NOT owner_is_test
           AND (NEW.owner_user_id IS NOT NULL OR NEW.owner_contractor_id IS NOT NULL) THEN
          PERFORM scm_test_isolation_violation('a test shop needs a test owner');
        END IF;
      ELSE
        IF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
          PERFORM scm_test_isolation_violation('shops.is_test cannot change');
        END IF;
        -- Owner set to null (owner deleted, ON DELETE SET NULL) is fine.
        IF (NEW.owner_user_id IS NOT NULL OR NEW.owner_contractor_id IS NOT NULL)
           AND owner_is_test IS DISTINCT FROM NEW.is_test THEN
          PERFORM scm_test_isolation_violation('shop ownership cannot cross between test and real accounts');
        END IF;
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS trg_shops_test_realm ON shops;
    CREATE TRIGGER trg_shops_test_realm
      BEFORE INSERT OR UPDATE OF owner_user_id, owner_contractor_id, is_test ON shops
      FOR EACH ROW EXECUTE FUNCTION scm_shops_test_realm();

    -- Orders and offer sessions: customer, assignee, org and shop in one realm.
    CREATE OR REPLACE FUNCTION scm_order_parties_same_realm() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF scm_is_mixed_realm(
           ARRAY[NEW.customer_id, NEW.assigned_id],
           ARRAY[NEW.contractor_id],
           ARRAY[NEW.shop_id]) THEN
        PERFORM scm_test_isolation_violation(TG_TABLE_NAME || ' parties');
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS trg_orders_same_realm ON orders;
    CREATE TRIGGER trg_orders_same_realm
      BEFORE INSERT OR UPDATE OF customer_id, assigned_id, contractor_id, shop_id ON orders
      FOR EACH ROW EXECUTE FUNCTION scm_order_parties_same_realm();
    DROP TRIGGER IF EXISTS trg_offer_sessions_same_realm ON offer_sessions;
    CREATE TRIGGER trg_offer_sessions_same_realm
      BEFORE INSERT OR UPDATE OF customer_id, assigned_id, contractor_id, shop_id ON offer_sessions
      FOR EACH ROW EXECUTE FUNCTION scm_order_parties_same_realm();

    CREATE OR REPLACE FUNCTION scm_contractor_members_same_realm() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF scm_is_mixed_realm(ARRAY[NEW.user_id], ARRAY[NEW.contractor_id], ARRAY[]::uuid[]) THEN
        PERFORM scm_test_isolation_violation('org membership');
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS trg_contractor_members_same_realm ON contractor_members;
    CREATE TRIGGER trg_contractor_members_same_realm
      BEFORE INSERT OR UPDATE OF user_id, contractor_id ON contractor_members
      FOR EACH ROW EXECUTE FUNCTION scm_contractor_members_same_realm();

    CREATE OR REPLACE FUNCTION scm_chat_participants_same_realm() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF scm_is_mixed_realm(
           ARRAY(SELECT user_id FROM chat_participants WHERE chat_id = NEW.chat_id) || NEW.user_id,
           ARRAY[]::uuid[], ARRAY[]::uuid[]) THEN
        PERFORM scm_test_isolation_violation('chat participants');
      END IF;
      RETURN NEW;
    END $$;

    DROP TRIGGER IF EXISTS trg_chat_participants_same_realm ON chat_participants;
    CREATE TRIGGER trg_chat_participants_same_realm
      BEFORE INSERT OR UPDATE OF user_id, chat_id ON chat_participants
      FOR EACH ROW EXECUTE FUNCTION scm_chat_participants_same_realm();
  `)

  if (await knex.schema.hasTable("test_login_events")) return
  await knex.schema.createTable("test_login_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    // As submitted (trimmed, max 100). Unknown usernames are recorded too.
    t.string("username", 100).notNullable()
    t.uuid("user_id").references("user_id").inTable("accounts").onDelete("SET NULL")
    t.string("outcome", 20).notNullable()
    // Internal reason; the client always gets the same generic error.
    t.string("reason", 40)
    t.string("ip", 64)
    t.string("user_agent", 500)
    t.string("origin", 200)
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.index(["created_at"], "idx_test_login_events_created")
    t.index(["user_id", "created_at"], "idx_test_login_events_user")
  })
  await knex.raw(`
    ALTER TABLE test_login_events ADD CONSTRAINT test_login_events_outcome_check
      CHECK (outcome IN ('success', 'failure', 'rate_limited'))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("test_login_events")
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_chat_participants_same_realm ON chat_participants;
    DROP TRIGGER IF EXISTS trg_contractor_members_same_realm ON contractor_members;
    DROP TRIGGER IF EXISTS trg_offer_sessions_same_realm ON offer_sessions;
    DROP TRIGGER IF EXISTS trg_orders_same_realm ON orders;
    DROP TRIGGER IF EXISTS trg_shops_test_realm ON shops;
    DROP TRIGGER IF EXISTS trg_contractors_test_flag_immutable ON contractors;
    DROP TRIGGER IF EXISTS trg_accounts_test_flag_immutable ON accounts;
    DROP FUNCTION IF EXISTS scm_chat_participants_same_realm();
    DROP FUNCTION IF EXISTS scm_contractor_members_same_realm();
    DROP FUNCTION IF EXISTS scm_order_parties_same_realm();
    DROP FUNCTION IF EXISTS scm_shops_test_realm();
    DROP FUNCTION IF EXISTS scm_test_flag_immutable();
    DROP FUNCTION IF EXISTS scm_is_mixed_realm(uuid[], uuid[], uuid[]);
    DROP FUNCTION IF EXISTS scm_test_isolation_violation(text);
    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_test_account_is_user;
    DROP INDEX IF EXISTS idx_shops_is_test;
    DROP INDEX IF EXISTS idx_contractors_is_test;
    DROP INDEX IF EXISTS idx_accounts_is_test;
    ALTER TABLE shops DROP COLUMN IF EXISTS is_test;
    ALTER TABLE contractors DROP COLUMN IF EXISTS is_test;
    ALTER TABLE accounts DROP COLUMN IF EXISTS is_test;
  `)
}
