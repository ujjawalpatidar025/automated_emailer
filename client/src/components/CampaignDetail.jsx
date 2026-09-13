import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Send,
  Paperclip,
  Pencil,
  X,
  Check,
  RotateCcw,
  AlertTriangle,
  Clock,
  BarChart3,
  Radio,
  CheckCircle2,
  XCircle,
  Users,
  Pause,
  Play,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const rowStatus = {
  sent: "success",
  failed: "destructive",
  pending: "secondary",
};

const statusVariant = {
  draft: "secondary",
  sending: "default",
  paused: "warning",
  completed: "success",
  failed: "destructive",
};

const PICK_OPTIONS = [
  { value: "start", label: "From start" },
  { value: "end", label: "From end" },
  { value: "offset", label: "After row…" },
];

function describePick(c) {
  if (c.pickFrom === "end")
    return "Next batch picks from the end of the sheet, working upwards.";
  if (c.pickFrom === "offset")
    return `Next batch skips the first ${c.pickOffset || 0} row(s) of the sheet, then picks in order.`;
  return "Next batch picks from the start of the sheet, in order.";
}

// A schedule with non-default time/count was deliberately set up at some
// point, even if it's currently off — worth surfacing as "paused" rather
// than just looking like it was never configured.
function wasEverConfigured(schedule) {
  if (!schedule) return false;
  return schedule.time !== "09:00" || schedule.count !== 50 || !!schedule.lastRunAt;
}

function describeSchedule(c) {
  const s = c.schedule;
  if (!s?.enabled) return "Off — sends only happen when you click Send.";
  let txt = `On — sends up to ${s.count} email(s) automatically every day at ${s.time}.`;
  if (s.lastRunAt) {
    txt += ` Last ran ${new Date(s.lastRunAt).toLocaleString()}${
      s.lastResult ? ` — ${s.lastResult}` : ""
    }`;
  }
  return txt;
}

export default function CampaignDetail({
  campaignId,
  onBack,
  onChanged,
  onOpenAnalytics,
}) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [count, setCount] = useState(10);
  const [selectedEmails, setSelectedEmails] = useState("");
  const [sendingSelected, setSendingSelected] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);

  // Live "what's sending right now" — fed by Server-Sent Events.
  const [live, setLive] = useState({ inProgress: false });
  const [activity, setActivity] = useState([]);
  const toastedBatchRef = useRef(null);

  function toastBatchDone(report) {
    if (!report || toastedBatchRef.current === report.batchNo) return;
    toastedBatchRef.current = report.batchNo;
    const trigger = report.trigger && report.trigger !== "manual" ? ` (${report.trigger})` : "";
    const msg = `Batch #${report.batchNo}${trigger} — ${report.sent} sent, ${report.failed} failed`;
    if (report.stoppedEarly) {
      toast.error(`${msg}. ${report.stopReason || "Stopped after a failure."}`);
    } else {
      toast.success(msg);
    }
  }

  async function load() {
    try {
      const { campaign } = await api.getCampaign(campaignId);
      setCampaign(campaign);
      setCount((prev) =>
        Math.min(prev, Math.max(1, campaign.counts.pending || 1))
      );
      return campaign;
    } catch (err) {
      toast.error(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setLive({ inProgress: false });
    setActivity([]);
    toastedBatchRef.current = null;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Realtime tracking: subscribe to this campaign's send events, regardless
  // of whether the batch was started from this tab, a schedule, or retry.
  useEffect(() => {
    const es = new EventSource(api.streamUrl(campaignId));

    es.addEventListener("snapshot", (e) => {
      const data = JSON.parse(e.data);
      setLive(data.progress || { inProgress: false });
    });

    es.addEventListener("progress", (e) => {
      const evt = JSON.parse(e.data);
      if (evt.type === "batch-start") {
        setLive(evt.progress);
        setActivity([]);
      } else if (evt.type === "sending") {
        setLive((l) => ({
          ...l,
          inProgress: true,
          currentEmail: evt.email,
          index: evt.index,
          total: evt.total,
          batchNo: evt.batchNo,
        }));
      } else if (evt.type === "sent" || evt.type === "failed") {
        setActivity((prev) => [evt, ...prev].slice(0, 8));
      } else if (evt.type === "batch-done") {
        setLive({ inProgress: false });
        toastBatchDone(evt.report);
        load();
        onChanged?.();
      }
    });

    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  function startEdit() {
    setDraft({
      name: campaign.name,
      subject: campaign.subject,
      body: campaign.body,
      pickFrom: campaign.pickFrom || "start",
      pickOffset: campaign.pickOffset || 0,
      schedule: {
        enabled: campaign.schedule?.enabled || false,
        time: campaign.schedule?.time || "09:00",
        count: campaign.schedule?.count || 50,
      },
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      return toast.error("Name, subject and body can't be empty");
    }
    setSaving(true);
    try {
      await api.updateCampaign(campaignId, {
        name: draft.name,
        subject: draft.subject,
        body: draft.body,
        pickFrom: draft.pickFrom,
        pickOffset: Math.max(0, Math.floor(Number(draft.pickOffset) || 0)),
        schedule: {
          enabled: draft.schedule.enabled,
          time: draft.schedule.time,
          count: Math.max(1, Math.floor(Number(draft.schedule.count) || 1)),
        },
      });
      toast.success("Campaign updated");
      setEditing(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    const n = Number(count);
    if (!n || n < 1) return toast.error("Enter how many emails to send");
    setSending(true);
    try {
      const res = await api.sendBatch(campaignId, n);
      toastBatchDone(res.report);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleRetryFailed() {
    setRetrying(true);
    try {
      const res = await api.retryFailed(campaignId);
      toastBatchDone(res.report);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetrying(false);
    }
  }

  async function handleToggleSchedule(enabled) {
    try {
      await api.updateCampaign(campaignId, {
        schedule: {
          enabled,
          time: campaign.schedule?.time,
          count: campaign.schedule?.count,
        },
      });
      toast.success(
        enabled
          ? `Scheduled again for ${campaign.schedule.time} daily`
          : "Schedule paused"
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleSendSelected() {
    const emails = selectedEmails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      return toast.error("Paste at least one email address");
    }
    setSendingSelected(true);
    try {
      const res = await api.sendSelected(campaignId, emails);
      toastBatchDone(res.report);
      if (res.added?.length) {
        toast.info(
          `${res.added.length} address(es) not in the sheet were added to this campaign: ${res.added.join(", ")}`
        );
      }
      const { invalid, alreadySent, alreadyFailed } = res.skipped || {};
      const notes = [];
      if (invalid?.length) notes.push(`not a valid email: ${invalid.join(", ")}`);
      if (alreadySent?.length) notes.push(`already sent: ${alreadySent.join(", ")}`);
      if (alreadyFailed?.length)
        notes.push(`currently marked failed — use Retry: ${alreadyFailed.join(", ")}`);
      if (notes.length) toast.warning(`Skipped — ${notes.join("; ")}`);
      setSelectedEmails("");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingSelected(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-40" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-48" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!campaign) return null;

  const { total, sent, failed, pending } = campaign.counts;
  const pct = total ? Math.round(((sent + failed) / total) * 100) : 0;
  const setDraftField = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const busy = sending || retrying || sendingSelected || campaign.status === "sending";

  return (
    <div className="grid gap-3.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="justify-self-start"
      >
        <ArrowLeft /> Back to campaigns
      </Button>

      {live.inProgress && (
        <Card className="border-primary/40">
          <CardContent className="grid gap-3 pt-4">

            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio className="size-4 animate-pulse text-primary" />
              Sending now — batch #{live.batchNo}, {live.index || 0} of{" "}
              {live.total || 0}
            </div>
            {live.currentEmail && (
              <p className="truncate text-sm text-muted-foreground">
                Currently sending to <b className="text-foreground">{live.currentEmail}</b>
              </p>
            )}
            <Progress
              value={live.total ? ((live.index || 0) / live.total) * 100 : 0}
            />
            {activity.length > 0 && (
              <ul className="grid gap-1 text-xs">
                {activity.map((a, i) => (
                  <li key={`${a.email}-${a.index}-${i}`} className="flex items-center gap-1.5">
                    {a.type === "sent" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <span className="truncate text-muted-foreground">
                      {a.email} {a.type === "failed" && a.error ? `— ${a.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="break-words">{campaign.name}</CardTitle>
                <Badge variant={statusVariant[campaign.status] || "secondary"}>
                  {campaign.status === "sending" && (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  )}
                  {campaign.status}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                {campaign.subject}
              </CardDescription>
            </div>
            {!editing ? (
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={onOpenAnalytics}>
                  <BarChart3 /> Analytics
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEdit}
                  disabled={campaign.status === "sending"}
                >
                  <Pencil /> Edit
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  <X /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          {campaign.status === "paused" && campaign.lastSendReport?.stoppedEarly && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Sending stopped after a failure</p>
                <p className="text-xs">{campaign.lastSendReport.stopReason}</p>
                <p className="text-xs">
                  Retry the failed address below, or send the next batch to
                  skip it and continue with the rest.
                </p>
              </div>
            </div>
          )}

          {editing ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Campaign name</Label>
                <Input
                  id="edit-name"
                  value={draft.name}
                  onChange={(e) => setDraftField("name")(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-subject">Subject</Label>
                <Input
                  id="edit-subject"
                  value={draft.subject}
                  onChange={(e) => setDraftField("subject")(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-body">Body</Label>
                <Textarea
                  id="edit-body"
                  rows={8}
                  value={draft.body}
                  onChange={(e) => setDraftField("body")(e.target.value)}
                />
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label>Where should the next batch start in the sheet?</Label>
                <div className="flex flex-wrap gap-2">
                  {PICK_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={
                        draft.pickFrom === opt.value ? "default" : "outline"
                      }
                      onClick={() => setDraftField("pickFrom")(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {draft.pickFrom === "offset" && (
                  <div className="mt-1 grid gap-2">
                    <Label htmlFor="edit-offset" className="text-xs">
                      Skip this many rows from the top of the sheet
                    </Label>
                    <Input
                      id="edit-offset"
                      type="number"
                      min={0}
                      max={total}
                      value={draft.pickOffset}
                      onChange={(e) =>
                        setDraftField("pickOffset")(e.target.value)
                      }
                      className="w-full sm:w-40"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {describePick({
                    pickFrom: draft.pickFrom,
                    pickOffset: draft.pickOffset,
                  })}{" "}
                  Already-sent rows are always skipped.
                </p>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="flex items-center gap-1.5">
                  <Clock className="size-4" /> Sending mode
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!draft.schedule.enabled ? "default" : "outline"}
                    onClick={() =>
                      setDraftField("schedule")({ ...draft.schedule, enabled: false })
                    }
                  >
                    Manual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={draft.schedule.enabled ? "default" : "outline"}
                    onClick={() =>
                      setDraftField("schedule")({ ...draft.schedule, enabled: true })
                    }
                  >
                    Scheduled
                  </Button>
                </div>
                {draft.schedule.enabled && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="sch-time" className="text-xs">
                        Time to send (24h)
                      </Label>
                      <Input
                        id="sch-time"
                        type="time"
                        value={draft.schedule.time}
                        onChange={(e) =>
                          setDraftField("schedule")({
                            ...draft.schedule,
                            time: e.target.value,
                          })
                        }
                        className="w-full sm:w-32"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sch-count" className="text-xs">
                        Emails per day
                      </Label>
                      <Input
                        id="sch-count"
                        type="number"
                        min={1}
                        value={draft.schedule.count}
                        onChange={(e) =>
                          setDraftField("schedule")({
                            ...draft.schedule,
                            count: e.target.value,
                          })
                        }
                        className="w-full sm:w-32"
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {draft.schedule.enabled
                    ? `A cron job runs every day at ${draft.schedule.time}, sending up to ${draft.schedule.count} pending recipient(s) automatically (same sending order as above). A failure stops that day's run early, same as a manual send.`
                    : "Switch to Scheduled to have a cron job send a fixed number of emails automatically, at the same time every day — no clicking required. Switching back to Manual removes the cron job."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {campaign.body}
              </pre>

              {campaign.resume?.originalName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip className="size-4" />
                  {campaign.resume.originalName}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Sending order: </span>
                  {describePick(campaign)}
                </div>
                <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">
                      <Clock className="mr-1 inline size-3" />
                      Schedule:{" "}
                    </span>
                    {describeSchedule(campaign)}
                  </div>
                  {(campaign.schedule?.enabled || wasEverConfigured(campaign.schedule)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => handleToggleSchedule(!campaign.schedule?.enabled)}
                    >
                      {campaign.schedule?.enabled ? (
                        <>
                          <Pause className="size-3" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-3" /> Resume
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {sent} sent · {failed} failed · {pending} pending
                  </span>
                  <span className="text-muted-foreground">{total} total</span>
                </div>
                <Progress value={pct} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="count">Batch size (emails per send)</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={pending || 1}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-full sm:w-40"
                    disabled={!pending || busy}
                  />
                </div>
                <Button onClick={handleSend} disabled={!pending || busy}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  {sending
                    ? "Sending…"
                    : `Send next batch (${Math.min(
                        Number(count) || 0,
                        pending
                      )})`}
                </Button>
                {failed > 0 && (
                  <Button variant="outline" onClick={handleRetryFailed} disabled={busy}>
                    {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    Retry {failed} failed
                  </Button>
                )}
                {!pending && !failed && (
                  <span className="text-sm text-muted-foreground">
                    All recipients processed.
                  </span>
                )}
              </div>
              {pending > 0 && (
                <p className="text-xs text-muted-foreground">
                  Each click sends the next{" "}
                  {Math.min(Number(count) || 0, pending)} of {pending} pending
                  recipient(s), {describePick(campaign).toLowerCase()} If any
                  email fails to send, the batch stops right there — progress
                  is saved to disk after every email.
                </p>
              )}

              <div className="grid gap-2 rounded-md border p-3">
                <Label htmlFor="selected-emails" className="flex items-center gap-1.5">
                  <Users className="size-4" /> Send to specific people
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="selected-emails"
                    placeholder="asha@corp.com, vikram@corp.com, priya@corp.com"
                    value={selectedEmails}
                    onChange={(e) => setSelectedEmails(e.target.value)}
                    disabled={busy}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleSendSelected}
                    disabled={busy || !selectedEmails.trim()}
                  >
                    {sendingSelected ? <Loader2 className="animate-spin" /> : <Send />}
                    Send to these
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Comma-separated email addresses — from this campaign's list,
                  or <b>anyone else</b>. Addresses not already in this campaign
                  are added to it and sent; ones still <b>pending</b> here are
                  sent as-is; already-sent or failed addresses are skipped and
                  reported back.
                </p>
              </div>

              {campaign.batchLog?.length > 0 && (
                <div className="rounded-md border">
                  <div className="border-b bg-muted px-3 py-2 text-xs font-medium">
                    Batch history
                  </div>
                  <ul className="divide-y text-xs">
                    {campaign.batchLog
                      .slice()
                      .reverse()
                      .map((b) => (
                        <li
                          key={b.batchNo}
                          className="flex justify-between px-3 py-2"
                        >
                          <span>
                            Batch #{b.batchNo}
                            {b.trigger && b.trigger !== "manual" ? ` (${b.trigger})` : ""}{" "}
                            — {b.sent} sent, {b.failed} failed
                            {b.stoppedEarly ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {" "}
                                (stopped early)
                              </span>
                            ) : null}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(b.finishedAt).toLocaleString()}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="p-2 font-medium">#</th>
                  <th className="p-2 font-medium">Email</th>
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {campaign.recipients.map((r, i) => (
                  <tr
                    key={r._id || r.email}
                    className={`border-t ${
                      live.inProgress && live.currentEmail === r.email
                        ? "bg-primary/5"
                        : ""
                    }`}
                  >
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">{r.name || "—"}</td>
                    <td className="p-2">
                      <Badge variant={rowStatus[r.status] || "secondary"}>
                        {live.inProgress && live.currentEmail === r.email
                          ? "sending…"
                          : r.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {r.status === "sent" && r.sentAt
                        ? new Date(r.sentAt).toLocaleString()
                        : r.error || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
