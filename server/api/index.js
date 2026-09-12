// Vercel serverless entry point. Do NOT add app.listen(), a cron scheduler,
// or the heartbeat here — a serverless function has no persistent process
// for any of those to run in. See README's "Deploying" section for what
// that means for this app (scheduled campaigns + live SSE tracking don't
// work here) and vercel.json for how every request gets routed to this file.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";

// On a normal long-running process, missing JWT_SECRET/CREDENTIAL_ENCRYPTION_KEY
// get auto-generated once and saved to .env (see utils/bootstrapEnv.js).
// There's no writable, persistent disk here, and cold starts are separate
// instances — auto-generating per-instance would silently mint a DIFFERENT
// secret each cold start, so tokens/encrypted passwords from one instance
// randomly fail on another. Require them explicitly instead of guessing.
const missing = ["MONGO_URI", "JWT_SECRET", "CREDENTIAL_ENCRYPTION_KEY"].filter(
  (k) => !process.env[k]
);

// Reuse the Mongo connection across warm invocations of the same instance
// instead of reconnecting on every request.
let connecting = null;
async function ensureDb() {
  if (mongoose.connection.readyState === 1) return; // already connected
  if (!connecting) connecting = connectDB(process.env.MONGO_URI);
  await connecting;
}

// Raw http.ServerResponse methods, not res.status()/res.json() — those are
// Express additions that only exist once a request has actually flowed
// through app(req, res). These two checks run before that, so they can't
// assume it.
function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (missing.length > 0) {
    sendJson(res, 500, {
      error: `Missing required environment variable(s) on this deployment: ${missing.join(", ")}`,
    });
    return;
  }
  try {
    await ensureDb();
  } catch (err) {
    console.error("[api] db connection failed:", err.message);
    sendJson(res, 500, { error: "Database connection failed" });
    return;
  }
  app(req, res);
}
