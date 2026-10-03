import { sendOneFor, verifyMailerFor } from "./mailer.js";
import { emitProgress } from "./progressBus.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where the next batch starts picking pending recipients from:
//   start  -> top of the sheet, in order (default)
//   end    -> bottom of the sheet, working upwards
//   offset -> skip the first `pickOffset` rows of the sheet, then go in order
export const PICK_MODES = ["start", "end", "offset"];

// Fixed gap between each individual email in a batch — not configurable.
// 2s, not more: every extra second here is pure dead time added to a
// batch's total request duration, and that duration is what actually
// decides whether the request finishes before Vercel's 60s maxDuration
// kills it mid-batch (see runBatch's staleness guard below, and the
// "Force stop" button on the campaign page for recovering when it does).
export const SEND_DELAY_MS = 2000;

/** Pending recipients for the next batch, ordered per the campaign's pick mode. */
export function orderedPending(campaign) {
  const mode = PICK_MODES.includes(campaign.pickFrom) ? campaign.pickFrom : "start";
  if (mode === "end") {
    return campaign.recipients.filter((r) => r.status === "pending").reverse();
  }
  if (mode === "offset") {
    const off = Math.max(0, Math.floor(Number(campaign.pickOffset) || 0));
    return campaign.recipients.slice(off).filter((r) => r.status === "pending");
  }
  return campaign.recipients.filter((r) => r.status === "pending");
}

/**
 * Replace {{key}} with recipient data. Supports a fallback:
 *   {{name|there}}  -> the name, or "there" if the CSV has no name column.
 * An unknown key with no fallback becomes "".
 */
function render(template, recipient) {
  const data = {
    email: recipient.email,
    name: recipient.name || "",
    ...(recipient.fields || {}),
  };
  return template.replace(
    /\{\{\s*([\w .-]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}/g,
    (_m, key, fallback = "") => {
      const direct = data[key];
      if (direct != null && String(direct).trim() !== "") return String(direct);
      const ci = Object.keys(data).find(
        (k) => k.toLowerCase() === String(key).toLowerCase()
      );
      if (ci != null && String(data[ci]).trim() !== "") return String(data[ci]);
      return fallback;
    }
  );
}

function textToHtml(text) {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${esc.replace(
    /\n/g,
    "<br/>"
  )}</div>`;
}

/**
 * Send `list` (recipient subdocuments belonging to `campaign`, already
 * resolved by the caller) one at a time, as `user` via their App Password.
 *
 * STOPS on the first failed send — the rest of `list` is left untouched
 * (still "pending") so nothing is skipped, no further mail goes out until
 * someone looks at it, and the run can be resumed or the address retried.
 *
 * Used by: the manual "send next batch" button, the daily scheduler, and
 * "retry failed" — so all three share one code path and one behaviour.
 */
export async function runBatch(
  campaign,
  list,
  { trigger = "manual", user, appPassword, deps } = {}
) {
  const send = deps?.sendOne || ((args) => sendOneFor(user, appPassword, args));
  const verify = deps?.verifyMailer || (() => verifyMailerFor(user, appPassword));

  if (campaign.status === "sending") {
    // A batch that's actually still running never takes longer than its own
    // worst-case estimate — if we're well past that, the process that was
    // running it died mid-batch (e.g. a Vercel function hitting its 60s
    // maxDuration) and left `status: "sending"` behind with nothing left to
    // ever finish it. Recovering automatically here means a crashed batch
    // only blocks the *next* attempt for a couple of minutes, not forever.
    const total = campaign.progress?.total || 1;
    const perEmailMs = SEND_DELAY_MS + 15_000; // + generous SMTP allowance
    const expectedMs = total * perEmailMs;
    const startedAt = campaign.progress?.startedAt
      ? new Date(campaign.progress.startedAt).getTime()
      : 0;
    const isStale = Date.now() - startedAt > expectedMs + 2 * 60 * 1000;

    if (!isStale) {
      throw Object.assign(new Error("This campaign is already sending"), {
        code: "ALREADY_SENDING",
      });
    }
    console.error(
      `[sendService] campaign ${campaign._id}: recovering from a stale "sending" status ` +
        `(started ${campaign.progress?.startedAt}, never finished) — likely crashed mid-batch`
    );
  }
  if (!list || list.length === 0) {
    throw Object.assign(new Error("Nothing to send"), { code: "EMPTY_BATCH" });
  }

  const batchNo = (campaign.batchLog?.length || 0) + 1;
  campaign.status = "sending";
  campaign.progress = {
    inProgress: true,
    batchNo,
    total: list.length,
    index: 0,
    currentEmail: null,
    trigger,
    startedAt: new Date(),
  };
  await campaign.save();
  emitProgress(campaign._id, { type: "batch-start", progress: campaign.progress });

  try {
    await verify();
  } catch (err) {
    campaign.status = "draft";
    campaign.progress = { inProgress: false };
    await campaign.save();
    throw Object.assign(new Error(`Mailer not configured: ${err.message}`), {
      code: "MAILER",
    });
  }

  const delay = SEND_DELAY_MS;
  const attachment = campaign.resume?.url
    ? { path: campaign.resume.url, originalName: campaign.resume.originalName }
    : null;

  let sent = 0;
  let failed = 0;
  let stoppedEarly = false;
  let stopReason = null;

  for (let i = 0; i < list.length; i += 1) {
    const recipient = list[i];
    campaign.progress.index = i + 1;
    campaign.progress.currentEmail = recipient.email;
    emitProgress(campaign._id, {
      type: "sending",
      email: recipient.email,
      index: i + 1,
      total: list.length,
      batchNo,
    });

    const subject = render(campaign.subject, recipient);
    const bodyRendered = render(campaign.body, recipient);
    const html = campaign.isHtml ? bodyRendered : textToHtml(bodyRendered);
    const text = campaign.isHtml
      ? bodyRendered.replace(/<[^>]+>/g, "")
      : bodyRendered;

    try {
      await send({ to: recipient.email, subject, text, html, attachment });
      recipient.status = "sent";
      recipient.sentAt = new Date();
      recipient.error = null;
      sent += 1;
      emitProgress(campaign._id, {
        type: "sent",
        email: recipient.email,
        index: i + 1,
        total: list.length,
        batchNo,
      });
    } catch (err) {
      recipient.status = "failed";
      recipient.failedAt = new Date();
      recipient.error = err?.message?.slice(0, 500) || "unknown error";
      failed += 1;
      stoppedEarly = true;
      stopReason = `Stopped after "${recipient.email}" failed: ${recipient.error}`;
      emitProgress(campaign._id, {
        type: "failed",
        email: recipient.email,
        index: i + 1,
        total: list.length,
        batchNo,
        error: recipient.error,
      });

      await campaign.save();
      break; // ← stop the whole process on the first failure
    }

    await campaign.save();

    if (i < list.length - 1) await sleep(delay);
  }

  const stillPending = campaign.recipients.some((r) => r.status === "pending");
  campaign.status = stoppedEarly && stillPending
    ? "paused"
    : stillPending
    ? "draft"
    : failed > 0 && sent === 0
    ? "failed"
    : "completed";

  const report = {
    batchNo,
    trigger,
    requested: list.length,
    attempted: sent + failed,
    sent,
    failed,
    stoppedEarly,
    stopReason,
    pickFrom: campaign.pickFrom || "start",
    pickOffset: campaign.pickFrom === "offset" ? campaign.pickOffset || 0 : undefined,
    finishedAt: new Date(),
  };
  campaign.lastSendReport = report;
  campaign.batchLog = [...(campaign.batchLog || []), report];
  campaign.progress = { inProgress: false };
  await campaign.save();

  emitProgress(campaign._id, {
    type: "batch-done",
    report,
    status: campaign.status,
    counts: campaign.counts,
  });

  return report;
}
