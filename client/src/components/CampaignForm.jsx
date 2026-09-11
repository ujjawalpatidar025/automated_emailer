import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Send, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PICK_OPTIONS = [
  { value: "start", label: "From start" },
  { value: "end", label: "From end" },
  { value: "offset", label: "After row…" },
];

const initialForm = {
  name: "",
  subject: "",
  body: "",
  pickFrom: "start",
  pickOffset: 0,
  mode: "manual", // "manual" | "scheduled" — scheduled is the only way a cron job gets created
  scheduleTime: "09:00",
  scheduleCount: 50,
};

export default function CampaignForm({ onCreated }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [resume, setResume] = useState(null);
  const [csv, setCsv] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!csv) return toast.error("Attach a recipients CSV file");
    if (!form.name || !form.subject || !form.body) {
      return toast.error("Name, subject and body are required");
    }

    const fd = new FormData();
    fd.append("name", form.name);
    fd.append("subject", form.subject);
    fd.append("body", form.body);
    fd.append("pickFrom", form.pickFrom);
    fd.append("pickOffset", String(form.pickOffset || 0));
    if (form.mode === "scheduled") {
      fd.append("scheduleEnabled", "true");
      fd.append("scheduleTime", form.scheduleTime);
      fd.append("scheduleCount", String(form.scheduleCount || 1));
    }
    if (resume) fd.append("resume", resume);
    fd.append("csv", csv);

    setSubmitting(true);
    try {
      const { campaign, parseSummary } = await api.createCampaign(fd);
      toast.success(
        `Campaign created — ${parseSummary.valid} valid recipient(s)` +
          (parseSummary.invalid ? `, ${parseSummary.invalid} skipped` : "") +
          (form.mode === "scheduled"
            ? `. Scheduled for ${form.scheduleTime} daily.`
            : "")
      );
      setForm(initialForm);
      setResume(null);
      setCsv(null);
      e.target.reset();
      onCreated?.(campaign);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a campaign</CardTitle>
        <CardDescription>
          Upload your resume and a CSV of recipients, write the email, then send
          in controlled batches. Use <code>{"{{name}}"}</code> or any CSV column
          name as a placeholder. If your list has emails only, use a fallback:{" "}
          <code>{"Hi {{name|there}},"}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              placeholder="Backend roles — September"
              value={form.name}
              onChange={set("name")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subject">Email subject</Label>
            <Input
              id="subject"
              placeholder="Application for {{role}} — Ujjawal Patidar"
              value={form.subject}
              onChange={set("subject")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="body">Email body</Label>
            <Textarea
              id="body"
              rows={8}
              placeholder={"Hi {{name|there}},\n\nI'd love to be considered for..."}
              value={form.body}
              onChange={set("body")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="resume">Resume (PDF / DOCX, optional)</Label>
              <Input
                id="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setResume(e.target.files?.[0] || null)}
              />
              {resume && (
                <span className="text-xs text-muted-foreground">
                  {resume.name} · {(resume.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="csv">Recipients CSV</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv"
                onChange={(e) => setCsv(e.target.files?.[0] || null)}
              />
              {csv && (
                <span className="text-xs text-muted-foreground">{csv.name}</span>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            The CSV just needs the email addresses — a bare list (with or without
            an <b>email</b> header) works. A <b>name</b> column is used for
            personalisation if present; any other columns become placeholders.
          </p>

          <div className="grid gap-2 rounded-md border p-3">
            <Label>Where should sending start in the sheet?</Label>
            <div className="flex flex-wrap gap-2">
              {PICK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={form.pickFrom === opt.value ? "default" : "outline"}
                  onClick={() =>
                    setForm((f) => ({ ...f, pickFrom: opt.value }))
                  }
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {form.pickFrom === "offset" && (
              <div className="mt-1 grid gap-2">
                <Label htmlFor="pickOffset" className="text-xs">
                  Skip this many rows from the top of the sheet
                </Label>
                <Input
                  id="pickOffset"
                  type="number"
                  min={0}
                  value={form.pickOffset}
                  onChange={set("pickOffset")}
                  className="w-full sm:w-40"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can change this any time from the campaign page. Already-sent
              rows are always skipped.
            </p>
          </div>

          <div className="grid gap-2 rounded-md border p-3">
            <Label>Sending mode</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.mode === "manual" ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, mode: "manual" }))}
              >
                <Send /> Manual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.mode === "scheduled" ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, mode: "scheduled" }))}
              >
                <Clock /> Scheduled
              </Button>
            </div>
            {form.mode === "scheduled" ? (
              <>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="scheduleTime" className="text-xs">
                      Time to send (24h, daily)
                    </Label>
                    <Input
                      id="scheduleTime"
                      type="time"
                      value={form.scheduleTime}
                      onChange={set("scheduleTime")}
                      className="w-full sm:w-32"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="scheduleCount" className="text-xs">
                      Emails per day
                    </Label>
                    <Input
                      id="scheduleCount"
                      type="number"
                      min={1}
                      value={form.scheduleCount}
                      onChange={set("scheduleCount")}
                      className="w-full sm:w-32"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A cron job is created for this campaign — every day at{" "}
                  {form.scheduleTime}, up to {form.scheduleCount || 0} pending
                  recipient(s) are sent automatically. Turn it off any time from
                  the campaign page.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing sends until you click "Send next batch" yourself. Switch
                to Scheduled to have it go out automatically instead — no cron
                job is created unless you pick that mode.
              </p>
            )}
          </div>

          <Button type="submit" disabled={submitting} className="justify-self-start">
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Upload />
            )}
            Create campaign
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
