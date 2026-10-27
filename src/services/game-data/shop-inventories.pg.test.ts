/**
 * In-game shop inventories as a step of the admin game data import, against a
 * real, throwaway Postgres.
 *
 * By default the step is off (the game files' shop data is stale): a
 * game-data.zip carrying shop-inventories.json is uploaded to AdminController
 * and game_shops stays empty, the job only noting that the file was ignored.
 *
 * With GAME_DATA_IMPORT_SHOPS=true the import refreshes game_shops /
 * game_shop_items, and GET /game-data/wiki/items/{id}/shops returns the shops.
 * A second import with a changed snapshot updates prices, drops items a shop
 * stopped selling and shops the game data no longer has, and a repeat of the
 * same snapshot changes nothing.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database:
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/game-data/shop-inventories.pg.test.ts
 *
 * The rest of the game data import (items, missions, ...) is stubbed: only
 * game_items (id, p4k_id) and the shop migration's tables exist here.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import knexFactory, { type Knex } from "knex"
import AdmZip from "adm-zip"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import type { Request as ExpressRequest } from "express"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"

const DB = "pgtest_game_shop_inventories"

const h = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: {
    get knex() {
      return h.db
    },
  },
  // The import's dedicated pool is the test database; the controller's
  // destroy() must not close it.
  createDedicatedKnex: () =>
    new Proxy(h.db as object, {
      get: (target, prop) =>
        prop === "destroy" ? async () => {} : Reflect.get(target, prop),
      apply: (target, thisArg, args) =>
        Reflect.apply(target as never, thisArg, args),
    }),
}))
vi.mock("../../logger/logger.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
  return { default: logger, logger }
})

import { up as shopsUp } from "../../../migrations/20260519000000_shop_inventories.js"
import {
  gameDataImportService,
  type GameDataPayload,
  type ImportStats,
} from "./import.service.js"
import {
  SHOP_IMPORT_DISABLED_NOTE,
  type P4KShopInventory,
} from "./shop-inventories.js"
import { AdminController } from "../../api/routes/v2/admin/AdminController.js"
import { WikiController } from "../../api/routes/v2/game-data/wiki/WikiController.js"

// game_items rows, keyed by their Data.p4k UUID
const RIFLE = {
  id: "a0000000-0000-4000-8000-000000000001",
  p4k_id: "p4k-rifle",
}
const HELMET = {
  id: "a0000000-0000-4000-8000-000000000002",
  p4k_id: "p4k-helmet",
}
const MEDPEN = {
  id: "a0000000-0000-4000-8000-000000000003",
  p4k_id: "p4k-medpen",
}

const shopItem = (
  id: string,
  name: string,
  buyPrice: number,
  sellPrice = 0,
) => ({
  id,
  name,
  type: null,
  subType: null,
  buyPrice,
  sellPrice,
})

const FIRST_SNAPSHOT: P4KShopInventory[] = [
  {
    shop: "Cubby Blast",
    location: "Area18",
    filename: "Inv_CubbyBlast_Area18.json",
    items: [
      shopItem(RIFLE.p4k_id, "P4-AR Rifle", 1250),
      shopItem(MEDPEN.p4k_id, "MedPen", 140),
    ],
  },
  {
    shop: "Live Fire Weapons",
    location: "Port Olisar",
    filename: "Inv_LiveFireWeapons_PortOlisar.json",
    items: [
      shopItem(RIFLE.p4k_id, "P4-AR Rifle", 1300),
      shopItem(HELMET.p4k_id, "Helmet", 900),
    ],
  },
  {
    shop: "Dumpers Depot",
    location: "Area18",
    filename: "Inv_DumpersDepot_Area18.json",
    // not a game_items row: stored unlinked
    items: [shopItem("p4k-unknown", "Scrap", 1.57)],
  },
]

// Next patch: Cubby Blast reprices the rifle and drops the MedPen, Live Fire
// Weapons is gone, Skutters opens.
const SECOND_SNAPSHOT: P4KShopInventory[] = [
  {
    shop: "Cubby Blast",
    location: "Area18",
    filename: "Inv_CubbyBlast_Area18.json",
    items: [shopItem(RIFLE.p4k_id, "P4-AR Rifle", 1199)],
  },
  FIRST_SNAPSHOT[2],
  {
    shop: "Skutters",
    location: "Grimhex",
    filename: "Inv_Skutters_Grimhex.json",
    items: [shopItem(HELMET.p4k_id, "Helmet", 850, 300.5)],
  },
]

const admin = {
  user: { user_id: "admin-1", role: "admin" },
} as unknown as ExpressRequest

let tmpDir: string

function zipWith(files: Record<string, unknown>): string {
  const zip = new AdmZip()
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(JSON.stringify(content)))
  }
  const file = path.join(tmpDir, `upload-${Date.now()}-${Math.random()}.zip`)
  zip.writeZip(file)
  return file
}

const gameData = {
  items: [{ id: RIFLE.p4k_id, name: "P4-AR Rifle", file: "rifle.xml" }],
}

/** Uploads a ZIP to the admin import and waits for the job to finish. */
async function runAdminImport(files: Record<string, unknown>) {
  const filePath = zipWith(files)
  const request = {
    ...admin,
    file: {
      originalname: "game-data.zip",
      mimetype: "application/zip",
      path: filePath,
      size: 1,
    },
    body: {},
  } as unknown as ExpressRequest
  const started = await new AdminController(request).importGameData(request)
  if (!("job_id" in started))
    throw new Error(`import not started: ${JSON.stringify(started)}`)
  for (let i = 0; i < 200; i++) {
    const { job } = await new AdminController(admin).getImportJobStatus(
      started.job_id,
      admin,
    )
    if (job && (job.status === "completed" || job.status === "failed"))
      return job
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error("import job did not finish")
}

const shopsFor = (id: string) =>
  new WikiController().getItemShops(id).then((r) => r.shops)

const db = () => h.db as Knex

describe.skipIf(!PG_TEST_URL)("game data import and in-game shops", () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shop-import-test-"))
    const connection = await createTestDatabase(DB)
    h.db = knexFactory({ client: "pg", connection, pool: { min: 0, max: 2 } })
    await db().schema.createTable("game_items", (t) => {
      t.uuid("id").primary()
      t.string("p4k_id").nullable()
    })
    await shopsUp(db())
    await db()("game_items").insert([RIFLE, HELMET, MEDPEN])

    // The rest of the import is not under test; run only the shop step, the
    // way importGameData does after its item steps.
    vi.spyOn(gameDataImportService, "importGameData").mockImplementation(
      async (knex: Knex, payload: GameDataPayload, options) => {
        const stats = { errors: [] as string[] } as ImportStats
        await gameDataImportService.refreshShopInventories(
          knex,
          payload,
          stats,
          options,
        )
        return stats
      },
    )
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await db()?.destroy()
    await dropTestDatabase(DB)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.mocked(gameDataImportService.importGameData).mockClear()
  })

  describe("by default (GAME_DATA_IMPORT_SHOPS unset)", () => {
    beforeAll(() => {
      vi.stubEnv("GAME_DATA_IMPORT_SHOPS", undefined)
    })

    it("ignores a ZIP's shop-inventories.json: no shops are written or shown", async () => {
      const job = await runAdminImport({
        "game-data.json": gameData,
        "shop-inventories.json": FIRST_SNAPSHOT,
      })

      expect(job.status).toBe("completed")
      expect(
        vi.mocked(gameDataImportService.importGameData).mock.calls[0][1]
          .shopInventories,
      ).toBeUndefined()
      expect(job.result?.errors).toEqual([SHOP_IMPORT_DISABLED_NOTE])
      expect(job.result?.summary).not.toHaveProperty("shopsImported")
      expect(await db()("game_shops").count({ n: "*" }).first()).toEqual({
        n: "0",
      })
      expect(await db()("game_shop_items").count({ n: "*" }).first()).toEqual({
        n: "0",
      })
      expect(await shopsFor(RIFLE.id)).toEqual([])
    })

    it("a ZIP without shop-inventories.json imports with no shop warning", async () => {
      const job = await runAdminImport({ "game-data.json": gameData })

      expect(job.status).toBe("completed")
      expect(job.result?.errors).toEqual([])
      expect(await db()("game_shops").count({ n: "*" }).first()).toEqual({
        n: "0",
      })
    })

    it('any value other than "true" keeps it off', async () => {
      vi.stubEnv("GAME_DATA_IMPORT_SHOPS", "1")
      try {
        const job = await runAdminImport({
          "game-data.json": gameData,
          "shop-inventories.json": FIRST_SNAPSHOT,
        })
        expect(job.result?.errors).toEqual([SHOP_IMPORT_DISABLED_NOTE])
        expect(await db()("game_shops").count({ n: "*" }).first()).toEqual({
          n: "0",
        })
      } finally {
        vi.stubEnv("GAME_DATA_IMPORT_SHOPS", undefined)
      }
    })
  })

  describe("with GAME_DATA_IMPORT_SHOPS=true", () => {
    beforeAll(() => {
      vi.stubEnv("GAME_DATA_IMPORT_SHOPS", "true")
    })

    it("imports the ZIP's shop-inventories.json and the wiki endpoint returns the shops", async () => {
      const job = await runAdminImport({
        "game-data.json": gameData,
        "shop-inventories.json": FIRST_SNAPSHOT,
      })

      expect(job.status).toBe("completed")
      expect(job.result?.summary).toMatchObject({
        shopsImported: 3,
        shopItemsImported: 5,
        shopItemsLinked: 4,
        shopsRemoved: 0,
        shopItemsRemoved: 0,
      })
      expect(job.result?.errors).toEqual([])

      expect(await shopsFor(RIFLE.id)).toEqual([
        expect.objectContaining({
          shop_name: "Cubby Blast",
          shop_location: "Area18",
          buy_price: 1250,
          sell_price: 0,
        }),
        expect.objectContaining({
          shop_name: "Live Fire Weapons",
          shop_location: "Port Olisar",
          buy_price: 1300,
        }),
      ])
      expect(await shopsFor(MEDPEN.id)).toEqual([
        expect.objectContaining({ shop_name: "Cubby Blast", buy_price: 140 }),
      ])
      const unlinked = await db()("game_shop_items")
        .where({ item_uuid: "p4k-unknown" })
        .first()
      expect(unlinked).toMatchObject({
        game_item_id: null,
        item_name: "Scrap",
        buy_price: "1.57",
      })
    })

    it("re-importing the same snapshot changes nothing", async () => {
      const before = await db()("game_shop_items")
        .orderBy("id")
        .select("id", "shop_id", "updated_at")
      const shopIdsBefore = await db()("game_shops").orderBy("id").pluck("id")

      const job = await runAdminImport({
        "game-data.json": gameData,
        "shop-inventories.json": FIRST_SNAPSHOT,
      })

      expect(job.result?.summary).toMatchObject({
        shopsImported: 3,
        shopsRemoved: 0,
        shopItemsRemoved: 0,
      })
      expect(await db()("game_shops").orderBy("id").pluck("id")).toEqual(
        shopIdsBefore,
      )
      // unchanged rows are not rewritten
      expect(
        await db()("game_shop_items")
          .orderBy("id")
          .select("id", "shop_id", "updated_at"),
      ).toEqual(before)
    })

    it("a new snapshot reprices, drops items no longer sold and shops no longer in the game", async () => {
      const cubbyId = (
        await db()("game_shops").where({ name: "Cubby Blast" }).first()
      ).id

      const job = await runAdminImport({
        "game-data.json": gameData,
        "shop-inventories.json": SECOND_SNAPSHOT,
      })

      expect(job.status).toBe("completed")
      expect(job.result?.summary).toMatchObject({
        shopsImported: 3,
        shopItemsImported: 3,
        shopsRemoved: 1,
        // MedPen at Cubby Blast + both Live Fire Weapons rows
        shopItemsRemoved: 3,
      })

      expect(await shopsFor(RIFLE.id)).toEqual([
        {
          shop_id: cubbyId,
          shop_name: "Cubby Blast",
          shop_location: "Area18",
          buy_price: 1199,
          sell_price: 0,
        },
      ])
      expect(await shopsFor(MEDPEN.id)).toEqual([])
      expect(await shopsFor(HELMET.id)).toEqual([
        expect.objectContaining({
          shop_name: "Skutters",
          shop_location: "Grimhex",
          buy_price: 850,
          sell_price: 300.5,
        }),
      ])
      expect(await db()("game_shops").orderBy("name").pluck("name")).toEqual([
        "Cubby Blast",
        "Dumpers Depot",
        "Skutters",
      ])
    })

    it("a ZIP without shop-inventories.json leaves the shops as they are and says so", async () => {
      const job = await runAdminImport({ "game-data.json": gameData })

      expect(job.status).toBe("completed")
      expect(job.result?.errors).toEqual([
        "ZIP has no shop-inventories.json; in-game shops were not refreshed",
      ])
      expect(await db()("game_shops").count({ n: "*" }).first()).toEqual({
        n: "3",
      })
      expect(await shopsFor(HELMET.id)).toHaveLength(1)
    })

    it("an empty snapshot does not wipe the shops", async () => {
      const job = await runAdminImport({
        "game-data.json": gameData,
        "shop-inventories.json": [],
      })

      expect(job.status).toBe("completed")
      expect(job.result?.errors).toEqual([
        "shop-inventories.json has no valid shops; in-game shops were not changed",
      ])
      expect(await db()("game_shop_items").count({ n: "*" }).first()).toEqual({
        n: "3",
      })
    })
  })
})
