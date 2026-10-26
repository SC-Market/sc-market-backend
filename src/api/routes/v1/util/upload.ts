import multer from "multer"
import fs from "node:fs"
import type { NextFunction, Request, Response } from "express"

// Caps on the multipart envelope, on top of the per-file size: without them a
// request could carry unlimited parts/fields and keep multer busy.
const ENVELOPE_LIMITS = { files: 5, fields: 20, parts: 30, fieldSize: 100 * 1000 }

// 5mb: sits above the image Lambda's 4mb decoded-byte gate so the Lambda (not
// multer) produces the user-facing "too large" error. The frontend downscales
// before upload, so real payloads are well under this.
const PHOTO_UPLOAD_LIMIT = 5 * 1000 * 1000

// Standard file upload configuration for photos
export const photoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
    ...ENVELOPE_LIMITS,
  },
})

// Configuration for single photo uploads
export const singlePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
    ...ENVELOPE_LIMITS,
  },
})

// Configuration for multiple photo uploads (up to 5)
export const multiplePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
    ...ENVELOPE_LIMITS,
  },
})

// Configuration for document uploads
export const documentUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1000 * 1000 /* 10mb */, ...ENVELOPE_LIMITS },
})

// Configuration for avatar uploads
export const avatarUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 1 * 1000 * 1000 /* 1mb */, ...ENVELOPE_LIMITS },
})

// Configuration for game data ZIP uploads (admin only)
export const gameDataZipUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1000 * 1000 /* 50mb */, ...ENVELOPE_LIMITS, files: 1 },
})

/**
 * Delete multer's temp files once the response is done, whatever the outcome.
 *
 * Handlers only removed them on their own success/error paths, so a request
 * rejected after parsing (403 not your listing, 404, validation errors, thrown
 * errors) left the upload in uploads/ forever, which is enough to fill the
 * disk. Register BEFORE the multer middleware. Not for routes that keep using
 * the file after responding (the admin game-data import job).
 */
export function removeUploadsWhenDone(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("close", () => {
    const files: Express.Multer.File[] = []
    if (req.file) files.push(req.file)
    if (Array.isArray(req.files)) files.push(...req.files)
    else if (req.files) for (const list of Object.values(req.files)) files.push(...list)
    for (const f of files) {
      if (f?.path) fs.rm(f.path, { force: true }, () => {})
    }
  })
  next()
}
