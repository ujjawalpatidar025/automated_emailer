import cron from "node-cron";
import { Campaign } from "./models/Campaign.js";
import { User } from "./models/User.js";
import { decryptSecret } from "./utils/crypto.js";
import { orderedPending, runBatch } from "./services/sendService.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Every schedule.time the user picks ("15:08") is IST wall-clock time,
// full stop — regardless of what timezone the machine running this process
// happens to be in (a Vercel/Render/Fly container defaults to UTC, which is
// 5.5 hours off and was the actual cause of "I scheduled 15:08 and nothing
// sent"). Every date/time computation below is pinned to this zone instead
// of trusting the server's local clock.
const IST_TZ = "Asia/Kolkata";

// campaignId (string) -> the node-cron ScheduledTask currently registered for it
const jobs = new Map();

/** Today's date in IST as "YYYY-MM-DD", no matter the server's own timezone. */
function todayStr(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: IST_TZ }); // en-CA formats as YYYY-MM-DD
}

/** Current wall-clock time in IST, as {dateStr, minutesSinceMidnight}. */
function nowInIST(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === "hour").value);
  const mm = Number(parts.find((p) => p.type === "minute").value);
  return { dateStr: todayStr(d), minutes: hh * 60 + mm, label: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} IST` };
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "09:30" -> "30 9 * * *" (minute hour every-day-of-month every-month every-weekday) */
function cronExprFor(time) {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

async function fireScheduledSend(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return removeCampaignSchedule(campaignId); // deleted since the job was registered
  if (!campaign.schedule?.enabled) return; // turned off since the job fired (race is harmless)
  if (campaign.status === "sending") return; // already busy elsewhere

  const today = todayStr();
  if (campaign.schedule.lastRunDate === today) return; // already ran today (e.g. re-registered mid-day on restart)

  const maxBatch = Number(process.env.MAX_BATCH_SIZE || 200);
  const count = Math.min(Math.max(1, Math.floor(Number(campaign.schedule.count) || 1)), maxBatch);

  campaign.schedule.lastRunDate = today;
  campaign.schedule.lastRunAt = new Date();
  await campaign.save();

  const list = orderedPending(campaign).slice(0, count);
  if (list.length === 0) {
    campaign.schedule.lastResult = "Ran, but there were no pending recipients to send.";
    await campaign.save();
    return;
  }

  try {
    const user = await User.findById(campaign.user).select("+gmailAppPasswordEnc");
    if (!user) throw new Error("Owning user account no longer exists");
    const appPassword = decryptSecret(user.gmailAppPasswordEnc);

    console.log(`[scheduler] cron fired for campaign ${campaign._id}: sending ${list.length}`);
    const report = await runBatch(campaign, list, { trigger: "scheduled", user, appPassword });
    campaign.schedule.lastResult = `Sent ${report.sent}, failed ${report.failed}${
      report.stoppedEarly ? " — stopped early after a failure" : ""
    }.`;
  } catch (err) {
    campaign.schedule.lastResult = `Error: ${err.message}`;
    console.error(`[scheduler] campaign ${campaign._id} failed:`, err.message);
  }
  await campaign.save();
}

/**
 * (Re)registers the cron job for one campaign from its current `schedule`.
 * Call this any time a campaign's schedule is created, edited, or deleted —
 * it always stops whatever job existed for that campaign first, so it's safe
 * to call unconditionally after any save.
 */
export function syncCampaignSchedule(campaign) {
  const id = String(campaign._id);

  const existing = jobs.get(id);
  if (existing) {
    existing.stop();
    jobs.delete(id);
  }

  if (!campaign.schedule?.enabled) return;
  if (!TIME_RE.test(campaign.schedule.time)) return;

  const expr = cronExprFor(campaign.schedule.time);
  const task = cron.schedule(expr, () => fireScheduledSend(id), { timezone: IST_TZ });
  jobs.set(id, task);
}

export function removeCampaignSchedule(campaignId) {
  const id = String(campaignId);
  const existing = jobs.get(id);
  if (existing) {
    existing.stop();
    jobs.delete(id);
  }
}

/** Loads every enabled schedule from the DB and registers a cron job for each. Call once at boot. */
export async function startScheduler() {
  const campaigns = await Campaign.find({ "schedule.enabled": true });
  for (const campaign of campaigns) syncCampaignSchedule(campaign);
  console.log(`[scheduler] registered ${jobs.size} cron job(s)`);
}

export function activeJobCount() {
  return jobs.size;
}

/**
 * Runs every schedule that is currently "due" in IST — enabled, valid time,
 * not already run today (IST), and that time has already passed for today.
 *
 * `syncCampaignSchedule`'s `node-cron` jobs only exist inside a long-running
 * process (`server/src/index.js`), which a Vercel serverless function is
 * never one of — no code there ever calls `startScheduler()`, so those jobs
 * are simply never registered on Vercel and nothing fires, independent of
 * timezone. This is the fallback that makes scheduling actually work there:
 * an outside pinger (see `tickHandler` below) hits `GET /api/cron/tick`
 * every few minutes, and whatever's due gets sent right there in that
 * request — no in-memory job needed. It's harmless to also run this
 * alongside the long-running server's `node-cron` path (e.g. after a missed
 * tick from a restart at exactly the scheduled minute); `fireScheduledSend`
 * already no-ops a campaign that already ran today or isn't enabled.
 */
export async function runDueSchedules() {
  const { dateStr, minutes: nowMinutes, label } = nowInIST();
  const campaigns = await Campaign.find({ "schedule.enabled": true });
  const due = campaigns.filter(
    (c) =>
      TIME_RE.test(c.schedule.time) &&
      c.schedule.lastRunDate !== dateStr &&
      timeToMinutes(c.schedule.time) <= nowMinutes
  );
  for (const c of due) await fireScheduledSend(String(c._id));
  return { checkedAt: label, ran: due.map((c) => String(c._id)) };
}

/**
 * `GET /api/cron/tick` — the serverless-friendly trigger for `runDueSchedules`.
 * Meant to be hit by an external scheduler (cron-job.org, GitHub Actions on a
 * `schedule:`, Vercel Cron, UptimeRobot's "keyword" check, …) every 5-15
 * minutes, not a logged-in user — so it's authenticated with a single shared
 * secret (`CRON_SECRET`) instead of a per-user JWT. Deliberately refuses to
 * run with no secret configured at all, rather than silently accepting an
 * unauthenticated request that can trigger real sends.
 */
export async function tickHandler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({
      error: "CRON_SECRET is not set on this deployment — refusing to run scheduled sends from an unauthenticated endpoint.",
    });
  }
  const provided = req.headers["x-cron-secret"] || req.query.key;
  if (provided !== secret) {
    return res.status(401).json({ error: "Invalid or missing cron secret" });
  }
  try {
    const result = await runDueSchedules();
    res.json({ ok: true, ranCount: result.ran.length, ...result });
  } catch (err) {
    console.error("[cron-tick] failed:", err.message);
    res.status(500).json({ error: err.message });
  }
}
