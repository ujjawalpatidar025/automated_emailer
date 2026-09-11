import fs from "node:fs";
import { Campaign } from "../models/Campaign.js";
import { User } from "../models/User.js";
import { decryptSecret } from "../utils/crypto.js";
import { parseRecipientsCsv } from "../services/csvService.js";
import { PICK_MODES, orderedPending, runBatch } from "../services/sendService.js";
import { subscribeProgress } from "../services/progressBus.js";
import { syncCampaignSchedule, removeCampaignSchedule } from "../scheduler.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The authenticated user, with their app password decrypted and ready to use. */
async function loadSender(userId) {
  const user = await User.findById(userId).select("+gmailAppPasswordEnc");
  if (!user) throw Object.assign(new Error("Not authenticated"), { code: "NO_USER" });
  return { user, appPassword: decryptSecret(user.gmailAppPasswordEnc) };
}

// POST /api/campaigns  (multipart/form-data)
// Sending mode is chosen right here: leave scheduleEnabled unset/false for a
// manual campaign, or set it (+ scheduleTime/scheduleCount) for a scheduled
// one — a cron job is only ever registered when that mode is explicitly picked.
export async function createCampaign(req, res) {
  const {
    name,
    subject,
    body,
    isHtml,
    pickFrom,
    pickOffset,
    scheduleEnabled,
    scheduleTime,
    scheduleCount,
  } = req.body;
  const csvFile = req.files?.csv?.[0];
  const resumeFile = req.files?.resume?.[0];

  if (!name || !subject || !body) {
    return res.status(400).json({ error: "name, subject and body are required" });
  }
  if (!csvFile) {
    return res.status(400).json({ error: "A recipients .csv file is required" });
  }

  const wantsSchedule = scheduleEnabled === "true" || scheduleEnabled === true;
  let schedule;
  if (wantsSchedule) {
    const time = scheduleTime || "09:00";
    if (!TIME_RE.test(time)) {
      return res.status(400).json({ error: "scheduleTime must be 24h HH:MM" });
    }
    schedule = {
      enabled: true,
      time,
      count: Math.max(1, Math.floor(Number(scheduleCount) || 50)),
    };
  }

  let parsed;
  try {
    parsed = parseRecipientsCsv(csvFile.path);
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }
  if (parsed.recipients.length === 0) {
    return res
      .status(400)
      .json({ error: "No valid email addresses found in the CSV" });
  }

  const campaign = await Campaign.create({
    user: req.userId,
    name,
    subject,
    body,
    isHtml: isHtml === "true" || isHtml === true,
    resume: resumeFile
      ? {
          path: resumeFile.path,
          originalName: resumeFile.originalname,
          mimeType: resumeFile.mimetype,
          size: resumeFile.size,
        }
      : undefined,
    recipients: parsed.recipients.map((r) => ({
      email: r.email,
      name: r.name,
      fields: r.fields,
      status: "pending",
    })),
    pickFrom: PICK_MODES.includes(pickFrom) ? pickFrom : "start",
    pickOffset: Math.max(0, Math.floor(Number(pickOffset) || 0)),
    ...(schedule ? { schedule } : {}),
  });

  syncCampaignSchedule(campaign); // registers the cron job now, if scheduled mode was chosen

  // the raw CSV upload is no longer needed
  fs.promises.unlink(csvFile.path).catch(() => {});

  res.status(201).json({
    campaign,
    parseSummary: {
      totalRows: parsed.totalRows,
      valid: parsed.recipients.length,
      invalid: parsed.invalidCount,
    },
  });
}

// GET /api/campaigns
export async function listCampaigns(req, res) {
  const campaigns = await Campaign.find({ user: req.userId })
    .select(
      "name subject status pickFrom pickOffset schedule progress lastSendReport createdAt updatedAt recipients.status"
    )
    .sort({ createdAt: -1 });
  res.json({ campaigns });
}

// GET /api/campaigns/:id
export async function getCampaign(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json({ campaign });
}

// PATCH /api/campaigns/:id
// body: any of { name, subject, body, isHtml, pickFrom, pickOffset, schedule }
export async function updateCampaign(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status === "sending") {
    return res
      .status(409)
      .json({ error: "Can't edit a campaign while it is sending" });
  }

  const { name, subject, body, isHtml, pickFrom, pickOffset, schedule } = req.body;

  if (name != null) {
    if (!String(name).trim()) return res.status(400).json({ error: "name cannot be empty" });
    campaign.name = String(name).trim();
  }
  if (subject != null) {
    if (!String(subject).trim()) return res.status(400).json({ error: "subject cannot be empty" });
    campaign.subject = String(subject);
  }
  if (body != null) {
    if (!String(body).trim()) return res.status(400).json({ error: "body cannot be empty" });
    campaign.body = String(body);
  }
  if (isHtml != null) campaign.isHtml = isHtml === true || isHtml === "true";

  if (pickFrom != null) {
    if (!PICK_MODES.includes(pickFrom)) {
      return res
        .status(400)
        .json({ error: `pickFrom must be one of: ${PICK_MODES.join(", ")}` });
    }
    campaign.pickFrom = pickFrom;
  }
  if (pickOffset != null) {
    const n = Number(pickOffset);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: "pickOffset must be a number >= 0" });
    }
    campaign.pickOffset = Math.floor(n);
  }

  if (schedule != null) {
    if (typeof schedule !== "object") {
      return res.status(400).json({ error: "schedule must be an object" });
    }
    const time = schedule.time ?? campaign.schedule?.time ?? "09:00";
    if (!TIME_RE.test(time)) {
      return res.status(400).json({ error: "schedule.time must be 24h HH:MM" });
    }
    const count = Math.max(
      1,
      Math.floor(Number(schedule.count ?? campaign.schedule?.count ?? 50))
    );
    campaign.schedule.enabled = !!schedule.enabled;
    campaign.schedule.time = time;
    campaign.schedule.count = count;
  }

  await campaign.save();
  syncCampaignSchedule(campaign); // (re)registers or cancels its cron job to match the new schedule
  res.json({ campaign });
}

// DELETE /api/campaigns/:id
export async function deleteCampaign(req, res) {
  const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  removeCampaignSchedule(campaign._id);
  if (campaign.resume?.path) {
    fs.promises.unlink(campaign.resume.path).catch(() => {});
  }
  res.json({ ok: true });
}

// POST /api/campaigns/:id/send   body: { count }
// Sends the NEXT batch: the first `count` recipients still marked "pending",
// ordered per the campaign's pickFrom/pickOffset. Stops on the first failure.
export async function sendBatch(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const maxBatch = Number(process.env.MAX_BATCH_SIZE || 200);
  const requested = Math.max(1, Number(req.body.count) || 0);
  const count = Math.min(requested, maxBatch);

  const allPending = campaign.recipients.filter((r) => r.status === "pending");
  if (allPending.length === 0) {
    return res.status(400).json({ error: "No pending recipients left to send" });
  }
  const ordered = orderedPending(campaign);
  if (ordered.length === 0) {
    return res.status(400).json({
      error: `No pending recipients past row ${campaign.pickOffset || 0}. Lower the "after N" offset or change the sending order.`,
    });
  }
  const list = ordered.slice(0, count);

  try {
    const { user, appPassword } = await loadSender(req.userId);
    const report = await runBatch(campaign, list, { trigger: "manual", user, appPassword });
    res.json({ report, counts: campaign.counts, status: campaign.status });
  } catch (err) {
    res.status(err.code === "ALREADY_SENDING" ? 409 : 400).json({ error: err.message });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/campaigns/:id/send-selected   body: { emails: "a@x.com, b@y.com" | string[] }
// Sends to exactly the given addresses. Anyone already in this campaign gets
// matched up (and sent only if still "pending" — already-sent/failed ones are
// reported back, not resent). Anyone NOT already in this campaign is added as
// a new recipient — this is also how you email someone outside the uploaded
// sheet — and sent along with the rest. Stops on the first failure, same as
// a normal send.
export async function sendSelected(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const raw = req.body.emails;
  const requested = (Array.isArray(raw) ? raw : String(raw || "").split(","))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    return res.status(400).json({ error: "Enter at least one email address" });
  }

  const maxBatch = Number(process.env.MAX_BATCH_SIZE || 200);
  if (requested.length > maxBatch) {
    return res
      .status(400)
      .json({ error: `You can send to at most ${maxBatch} addresses at once` });
  }

  const invalid = requested.filter((e) => !EMAIL_RE.test(e));
  const uniqueValid = [...new Set(requested.filter((e) => EMAIL_RE.test(e)))];

  const byEmail = new Map(campaign.recipients.map((r) => [r.email.toLowerCase(), r]));

  const list = [];
  const added = [];
  const alreadySent = [];
  const alreadyFailed = [];

  for (const email of uniqueValid) {
    const existing = byEmail.get(email);
    if (!existing) {
      // not in the uploaded sheet — add them to this campaign and send anyway
      campaign.recipients.push({ email, name: "", fields: {}, status: "pending" });
      list.push(campaign.recipients[campaign.recipients.length - 1]);
      added.push(email);
    } else if (existing.status === "pending") {
      list.push(existing);
    } else if (existing.status === "sent") {
      alreadySent.push(existing.email);
    } else {
      alreadyFailed.push(existing.email);
    }
  }

  if (list.length === 0) {
    const bits = [];
    if (invalid.length) bits.push(`not a valid email: ${invalid.join(", ")}`);
    if (alreadySent.length) bits.push(`already sent: ${alreadySent.join(", ")}`);
    if (alreadyFailed.length) bits.push(`failed — use Retry: ${alreadyFailed.join(", ")}`);
    return res.status(400).json({
      error: `Nothing to send${bits.length ? " (" + bits.join("; ") + ")" : ""}.`,
    });
  }

  try {
    const { user, appPassword } = await loadSender(req.userId);
    // runBatch saves the campaign as its first step, which also persists any
    // newly-added recipients above — even if the send itself then fails to
    // start (e.g. bad credentials), so the address isn't lost.
    const report = await runBatch(campaign, list, { trigger: "selected", user, appPassword });
    res.json({
      report,
      counts: campaign.counts,
      status: campaign.status,
      added,
      skipped: { invalid, alreadySent, alreadyFailed },
    });
  } catch (err) {
    res.status(err.code === "ALREADY_SENDING" ? 409 : 400).json({ error: err.message });
  }
}

// POST /api/campaigns/:id/retry-failed   body: { ids?: string[], count? }
// With `ids`, retries exactly those recipients. Otherwise retries up to
// `count` (default: all) failed recipients, in sheet order. Also stops on
// the first failure, same as a normal send.
export async function retryFailed(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status === "sending") {
    return res.status(409).json({ error: "This campaign is already sending" });
  }

  const { ids, count } = req.body || {};
  const maxBatch = Number(process.env.MAX_BATCH_SIZE || 200);

  let targets;
  if (Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids.map(String));
    targets = campaign.recipients.filter((r) => r.status === "failed" && idSet.has(String(r._id)));
  } else {
    const failedRecipients = campaign.recipients.filter((r) => r.status === "failed");
    const n = count != null ? Math.max(1, Number(count) || 0) : failedRecipients.length;
    targets = failedRecipients.slice(0, Math.min(n, maxBatch));
  }

  if (targets.length === 0) {
    return res.status(400).json({ error: "No matching failed recipients to retry" });
  }

  for (const r of targets) {
    r.status = "pending";
    r.error = null;
  }
  await campaign.save();

  try {
    const { user, appPassword } = await loadSender(req.userId);
    const report = await runBatch(campaign, targets, { trigger: "retry", user, appPassword });
    res.json({ report, counts: campaign.counts, status: campaign.status });
  } catch (err) {
    res.status(err.code === "ALREADY_SENDING" ? 409 : 400).json({ error: err.message });
  }
}

// GET /api/campaigns/:id/stream   (Server-Sent Events)
// Live "what's sending right now" feed for one campaign.
export async function streamCampaign(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(
    `event: snapshot\ndata: ${JSON.stringify({
      status: campaign.status,
      progress: campaign.progress || { inProgress: false },
    })}\n\n`
  );

  const unsubscribe = subscribeProgress(String(campaign._id), (evt) => {
    res.write(`event: progress\ndata: ${JSON.stringify(evt)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function buildDailySeries(recipients) {
  const byDay = {};
  for (const r of recipients) {
    if (r.status === "sent" && r.sentAt) {
      const d = new Date(r.sentAt).toISOString().slice(0, 10);
      (byDay[d] ??= { date: d, sent: 0, failed: 0 }).sent += 1;
    } else if (r.status === "failed" && r.failedAt) {
      const d = new Date(r.failedAt).toISOString().slice(0, 10);
      (byDay[d] ??= { date: d, sent: 0, failed: 0 }).failed += 1;
    }
  }
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}

// GET /api/campaigns/:id/analytics
export async function getCampaignAnalytics(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, user: req.userId });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const failedRecipients = campaign.recipients
    .filter((r) => r.status === "failed")
    .map((r) => ({
      _id: r._id,
      email: r.email,
      name: r.name,
      error: r.error,
      failedAt: r.failedAt,
    }));

  res.json({
    campaign: {
      _id: campaign._id,
      name: campaign.name,
      status: campaign.status,
      schedule: campaign.schedule,
    },
    counts: campaign.counts,
    series: buildDailySeries(campaign.recipients),
    batchLog: campaign.batchLog || [],
    failedRecipients,
  });
}

// GET /api/analytics  — overview across every campaign belonging to this user
export async function getGlobalAnalytics(req, res) {
  const campaigns = await Campaign.find({ user: req.userId });
  const totals = { total: 0, sent: 0, failed: 0, pending: 0 };
  const perCampaign = [];
  const byDay = {};

  for (const c of campaigns) {
    const cc = c.counts;
    totals.total += cc.total;
    totals.sent += cc.sent;
    totals.failed += cc.failed;
    totals.pending += cc.pending;
    perCampaign.push({ _id: c._id, name: c.name, status: c.status, counts: cc });

    for (const day of buildDailySeries(c.recipients)) {
      const bucket = (byDay[day.date] ??= { date: day.date, sent: 0, failed: 0 });
      bucket.sent += day.sent;
      bucket.failed += day.failed;
    }
  }

  res.json({
    totals,
    campaigns: perCampaign,
    series: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
