// Entry point for running this as a normal, long-running process — local
// dev, Fly.io, Render, a VPS, `npm start`. NOT used on Vercel: see
// api/index.js for the serverless entry point (different bootstrap, since a
// serverless function must never call app.listen() and can't run a
// persistent cron scheduler or heartbeat — see README's "Deploying" section).
import "dotenv/config";
import { bootstrapSecrets } from "./utils/bootstrapEnv.js";

bootstrapSecrets();

import { connectDB } from "./config/db.js";
import { startScheduler } from "./scheduler.js";
import { startHeartbeat } from "./heartbeat.js";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

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
