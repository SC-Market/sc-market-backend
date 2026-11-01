import { describe, it, expect, vi } from "vitest"
import {
  matchGameItemsByName,
  pickUniqueMatches,
} from "./game-item-match.service.js"

describe("pickUniqueMatches", () => {
  it("links a unique exact match", () => {
    const m = pickUniqueMatches(["Arrowhead Sniper Rifle"], [
      { title: "Arrowhead Sniper Rifle", id: "a", exact: true },
    ])
    expect(m.get("Arrowhead Sniper Rifle")).toBe("a")
  })

  it("prefers the unique exact match over normalised ones", () => {
    const m = pickUniqueMatches(["P4-AR"], [
      { title: "P4-AR", id: "exact", exact: true },
      { title: "P4-AR", id: "norm", exact: false },
    ])
    expect(m.get("P4-AR")).toBe("exact")
  })

  it("links a unique normalised match", () => {
    const m = pickUniqueMatches(["p4 ar  rifle"], [
      { title: "p4 ar  rifle", id: "n", exact: false },
    ])
    expect(m.get("p4 ar  rifle")).toBe("n")
  })

  it("leaves ambiguous exact or normalised matches unlinked", () => {
    const m = pickUniqueMatches(["Dup", "Norm"], [
      { title: "Dup", id: "1", exact: true },
      { title: "Dup", id: "2", exact: true },
      { title: "Norm", id: "3", exact: false },
      { title: "Norm", id: "4", exact: false },
    ])
    expect(m.get("Dup")).toBeNull()
    expect(m.get("Norm")).toBeNull()
  })

  it("leaves titles without candidates unlinked", () => {
    expect(pickUniqueMatches(["Nope"], []).get("Nope")).toBeNull()
  })
})

describe("matchGameItemsByName", () => {
  it("queries once for the distinct non-empty titles", async () => {
    const raw = vi.fn(async () => ({
      rows: [{ title: "Gun", id: "g1", exact: true }],
    }))
    const m = await matchGameItemsByName({ raw } as never, ["Gun", "Gun", " ", "Hat"])
    expect(raw).toHaveBeenCalledTimes(1)
    expect((raw.mock.calls[0] as unknown[])[1]).toEqual([JSON.stringify(["Gun", "Hat"])])
    expect(m.get("Gun")).toBe("g1")
    expect(m.get("Hat")).toBeNull()
    expect(m.get(" ")).toBeNull()
  })

  it("skips the query when no title is usable", async () => {
    const raw = vi.fn()
    const m = await matchGameItemsByName({ raw } as never, [""])
    expect(raw).not.toHaveBeenCalled()
    expect(m.get("")).toBeNull()
  })
})
