import cron from "node-cron";
import http from "node:http";
import mongoose from "mongoose";

function pingSelf(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      res.resume(); // drain so the socket can close
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function tick(port) {
  const dbUp = mongoose.connection.readyState === 1; // 1 === connected
  const httpStatus = await pingSelf(port);
  console.log(
    `[heartbeat] ${new Date().toISOString()} db=${dbUp ? "up" : "down"} http=${httpStatus ?? "unreachable"}`
  );
}

/**
 * A cron job (every 4 minutes) that self-checks the DB connection and the
 * HTTP stack, so the process has a steady, visible heartbeat in the logs and
 * its MongoDB connection doesn't go idle between real requests.
 *
 * Note: on hosting platforms that suspend a service after a period of no
 * *inbound* traffic (Render/Railway/Heroku free tiers, etc.), a same-process
 * self-ping usually doesn't count as external traffic and won't by itself
 * stop the platform from sleeping the service — for that you'd still want an
 * external uptime pinger hitting the public URL. This keeps the app's own
 * connections warm either way, and makes a hung DB/HTTP path show up in logs
 * quickly instead of only on the next real request.
 */
export function startHeartbeat(port) {
  tick(port);
  return cron.schedule("*/4 * * * *", () => tick(port));
}
