import express from "express";
import cors from "cors";
import multer from "multer";
import authRoutes from "./routes/authRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import { tickHandler } from "./scheduler.js";

// Trim a trailing slash — CORS origin matching is exact, and it's an easy
// way to paste CLIENT_URL wrong and get this same error again.
const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");

const app = express();

// Auth is a Bearer token in the Authorization header now, not a cookie, so
// `credentials`/cookie-parser aren't needed — cors() already reflects
// whatever headers a preflight asks for (Authorization included).
app.use(cors({ origin: clientUrl }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Not user-authenticated (no JWT) — meant to be hit by an external scheduler
// on a shared secret. This is what makes scheduled campaigns actually fire
// on a serverless deployment (Vercel), where node-cron's in-memory jobs
// never run at all. See scheduler.js's tickHandler for details.
app.get("/api/cron/tick", (req, res, next) => Promise.resolve(tickHandler(req, res)).catch(next));

app.use("/api/auth", authRoutes);
app.use("/api", campaignRoutes);

// centralised error handler
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err?.message) {
    console.error("[error]", err.message);
    return res.status(400).json({ error: err.message });
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
