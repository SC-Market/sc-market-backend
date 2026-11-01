import { describe, expect, it } from "vitest"
import {
  itemKeys,
  parseStoredRewards,
  refClassName,
  rewardKeys,
} from "./reward-resolution.js"

const REF =
  "file://./../../../../../libs/foundry/records/entities/spaceships/ANVL_Hornet_F7_Mk2_Collector_Mod.json"
const P4K = "41494CBF-8D90-4BB5-ABD3-3B20CD694FC9"

describe("mission item reward keys", () => {
  it("takes the record class name from a ref", () => {
    expect(refClassName(REF)).toBe("anvl_hornet_f7_mk2_collector_mod")
    expect(refClassName("behr_rifle_ballistic_01.json")).toBe(
      "behr_rifle_ballistic_01",
    )
    expect(refClassName("")).toBeNull()
    expect(refClassName("dir/")).toBeNull()
    expect(refClassName(undefined)).toBeNull()
  })

  it("keys a reward by p4k id and class name, lower case; ignores a non-UUID itemId", () => {
    expect(rewardKeys({ name: "F7", ref: REF, itemId: P4K })).toEqual([
      `id:${P4K.toLowerCase()}`,
      "file:anvl_hornet_f7_mk2_collector_mod",
    ])
    expect(rewardKeys({ name: "x", ref: "", itemId: "not-a-uuid" })).toEqual([])
  })

  it("keys a game item the same way", () => {
    expect(
      itemKeys({
        p4k_id: P4K.toLowerCase(),
        p4k_file: "ANVL_Hornet_F7_Mk2_Collector_Mod",
      }),
    ).toEqual(rewardKeys({ ref: REF, itemId: P4K }))
    expect(itemKeys({ p4k_id: null, p4k_file: null })).toEqual([])
  })

  it("parses stored rewards: array, JSON text, anything else is none", () => {
    const r = [{ name: "a", ref: "a.json" }]
    expect(parseStoredRewards(r)).toEqual(r)
    expect(parseStoredRewards(JSON.stringify(r))).toEqual(r)
    expect(parseStoredRewards("{oops")).toEqual([])
    expect(parseStoredRewards(null)).toEqual([])
    expect(parseStoredRewards({ name: "a" })).toEqual([])
    expect(parseStoredRewards([null, 3, { name: "b" }])).toEqual([
      { name: "b" },
    ])
  })
})
