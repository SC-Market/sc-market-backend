import multer from "multer"

// Standard file upload configuration for photos
export const photoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 2.5 * 1000 * 1000 /* 2.5mb to account for multipart overhead */,
  },
})

// Configuration for single photo uploads
export const singlePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 2.5 * 1000 * 1000 /* 2.5mb to account for multipart overhead */,
  },
})

// Configuration for multiple photo uploads (up to 5)
export const multiplePhotoUpload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 2.5 * 1000 * 1000 /* 2.5mb to account for multipart overhead */,
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
