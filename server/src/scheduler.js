import cron from "node-cron";
import { Campaign } from "./models/Campaign.js";
import { User } from "./models/User.js";
import { decryptSecret } from "./utils/crypto.js";
import { orderedPending, runBatch } from "./services/sendService.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// campaignId (string) -> the node-cron ScheduledTask currently registered for it
const jobs = new Map();

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const task = cron.schedule(expr, () => fireScheduledSend(id));
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
