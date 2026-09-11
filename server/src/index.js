import "dotenv/config";
import { bootstrapSecrets } from "./utils/bootstrapEnv.js";

bootstrapSecrets();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import { startScheduler } from "./scheduler.js";
import { startHeartbeat } from "./heartbeat.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Trim a trailing slash — CORS origin matching is exact, and it's an easy
// way to paste CLIENT_URL wrong and get this same error again.
const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
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

connectDB(process.env.MONGO_URI)
  .then(() => startScheduler()) // registers a cron job for every enabled campaign schedule
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] http://localhost:${PORT}`);
      startHeartbeat(PORT);
      console.log("[heartbeat] running every 4 minutes");
    });
  })
  .catch((err) => {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  });
