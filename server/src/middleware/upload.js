import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel's filesystem is read-only outside of /tmp — trying to mkdir under
// the deployed bundle throws at import time and takes down every route, not
// just uploads. Use the OS temp dir there instead.
//
// Note this only really works on a normal long-running process (local dev,
// Fly.io, Render): on Vercel, /tmp is ephemeral *per invocation*, so a resume
// uploaded while creating a campaign may not exist by the time a later
// "send" request (quite possibly a different, freshly cold-started instance)
// tries to attach it. See README's "Deploying" section.
export const UPLOAD_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "automator-email-uploads")
  : path.resolve(__dirname, "../../uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
  },
});

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
