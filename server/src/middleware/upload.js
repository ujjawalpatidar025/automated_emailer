import multer from "multer";

// Both the resume (uploaded to Cloudinary) and the CSV (parsed once, then
// discarded) only ever need the raw bytes for the lifetime of one request —
// memory storage avoids touching disk at all, which also sidesteps Vercel's
// read-only filesystem (only /tmp is writable there, and it isn't shared
// across invocations) without needing any environment-specific branching.
const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  if (file.fieldname === "csv") {
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/octet-stream" ||
      file.originalname.toLowerCase().endsWith(".csv");
    return ok ? cb(null, true) : cb(new Error("Recipients file must be a .csv"));
  }
  if (file.fieldname === "resume") {
    const ok = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.mimetype);
    return ok ? cb(null, true) : cb(new Error("Resume must be a PDF or Word document"));
  }
  return cb(null, false);
}

export const uploadCampaignFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per file
}).fields([
  { name: "resume", maxCount: 1 },
  { name: "csv", maxCount: 1 },
]);
