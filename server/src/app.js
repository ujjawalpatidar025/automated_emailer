import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import authRoutes from "./routes/authRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";

// Trim a trailing slash — CORS origin matching is exact, and it's an easy
// way to paste CLIENT_URL wrong and get this same error again.
const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");

const app = express();

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

export default app;
