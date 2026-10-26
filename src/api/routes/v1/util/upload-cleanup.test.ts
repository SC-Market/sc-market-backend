/**
 * multer temp files survived every rejection after parsing (403 not your
 * listing, 404, validation errors, thrown errors), so repeated uploads could
 * fill the disk. removeUploadsWhenDone deletes them when the response ends.
 */

import { describe, it, expect } from "vitest"
import express from "express"
import request from "supertest"
import multer from "multer"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { removeUploadsWhenDone } from "./upload.js"

function app(dest: string) {
  const upload = multer({ dest })
  const a = express()
  const seen: string[] = []
  a.post(
    "/forbidden",
    removeUploadsWhenDone,
    upload.array("photos", 5),
    (req, res) => {
      for (const f of req.files as Express.Multer.File[]) seen.push(f.path)
      res.status(403).json({ error: "not yours" })
    },
  )
  a.post(
    "/throws",
    removeUploadsWhenDone,
    upload.single("photo"),
    (req, _res, next) => {
      seen.push(req.file!.path)
      next(new Error("boom"))
    },
  )
  return { a, seen }
}

async function settle() {
  await new Promise((r) => setTimeout(r, 50))
}

describe("removeUploadsWhenDone", () => {
  it("deletes uploaded files when the handler rejects the request", async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "upload-cleanup-"))
    const { a, seen } = app(dest)
    await request(a)
      .post("/forbidden")
      .attach("photos", Buffer.from("x".repeat(1000)), "a.png")
      .attach("photos", Buffer.from("y".repeat(1000)), "b.png")
      .expect(403)
    await settle()
    expect(seen).toHaveLength(2)
    for (const p of seen) expect(fs.existsSync(p)).toBe(false)
    expect(fs.readdirSync(dest)).toEqual([])
  })

  it("deletes the file when the handler errors", async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "upload-cleanup-"))
    const { a, seen } = app(dest)
    await request(a)
      .post("/throws")
      .attach("photo", Buffer.from("z"), "c.png")
      .expect(500)
    await settle()
    expect(seen).toHaveLength(1)
    expect(fs.readdirSync(dest)).toEqual([])
  })
})
