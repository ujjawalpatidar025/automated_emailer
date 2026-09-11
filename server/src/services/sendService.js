import { sendOneFor, verifyMailerFor } from "./mailer.js";
import { emitProgress } from "./progressBus.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where the next batch starts picking pending recipients from:
//   start  -> top of the sheet, in order (default)
//   end    -> bottom of the sheet, working upwards
//   offset -> skip the first `pickOffset` rows of the sheet, then go in order
export const PICK_MODES = ["start", "end", "offset"];

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
    throw Object.assign(new Error("This campaign is already sending"), {
      code: "ALREADY_SENDING",
    });
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

  const delay = Number(process.env.SEND_DELAY_MS || 2000);
  const attachment = campaign.resume?.path
    ? { path: campaign.resume.path, originalName: campaign.resume.originalName }
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
