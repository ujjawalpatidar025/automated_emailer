import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

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
