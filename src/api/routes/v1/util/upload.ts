import multer from "multer"

// 5mb: sits above the image Lambda's 4mb decoded-byte gate so the Lambda (not
// multer) produces the user-facing "too large" error. The frontend downscales
// before upload, so real payloads are well under this.
const PHOTO_UPLOAD_LIMIT = 5 * 1000 * 1000

// Standard file upload configuration for photos
export const photoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
  },
})

// Configuration for single photo uploads
export const singlePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
  },
})

// Configuration for multiple photo uploads (up to 5)
export const multiplePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: PHOTO_UPLOAD_LIMIT,
  },
})

// Configuration for document uploads
export const documentUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1000 * 1000 /* 10mb */ },
})

// Configuration for avatar uploads
export const avatarUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 1 * 1000 * 1000 /* 1mb */ },
})

// Configuration for game data ZIP uploads (admin only)
export const gameDataZipUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1000 * 1000 /* 50mb */ },
})
