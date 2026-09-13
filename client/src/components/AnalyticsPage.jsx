import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCcw,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const statusVariant = {
  draft: "secondary",
  sending: "default",
  paused: "warning",
  completed: "success",
  failed: "destructive",
};

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3.5">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function DailyBarChart({ series }) {
  if (!series.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No emails sent yet — nothing to chart.
      </p>
    );
  }
  const max = Math.max(1, ...series.map((d) => Math.max(d.sent, d.failed)));
  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-2">
        {series.map((d) => (
          <div
            key={d.date}
            className="flex shrink-0 flex-col items-center gap-1"
            style={{ minWidth: 34 }}
          >
            <div className="flex h-32 items-end gap-1">
              <div
                className="w-3 rounded-t bg-emerald-500 dark:bg-emerald-400"
                style={{ height: `${Math.max(2, (d.sent / max) * 100)}%` }}
                title={`${d.date}: ${d.sent} sent`}
              />
              <div
                className="w-3 rounded-t bg-red-500 dark:bg-red-400"
                style={{
                  height: d.failed ? `${Math.max(2, (d.failed / max) * 100)}%` : 0,
                }}
                title={`${d.date}: ${d.failed} failed`}
              />
            </div>
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">
              {d.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
          Sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-500 dark:bg-red-400" />
          Failed
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage({ campaignId, onBack, onOpenCampaign }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null); // recipient _id or "all"

  async function load() {
    try {
      const res = campaignId
        ? await api.getCampaignAnalytics(campaignId)
        : await api.getGlobalAnalytics();
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function retry(ids) {
    setRetrying(ids ? ids[0] : "all");
    try {
      const res = await api.retryFailed(campaignId, ids ? { ids } : {});
      toast.success(
        `Retry batch #${res.report.batchNo} — ${res.report.sent} sent, ${res.report.failed} failed` +
          (res.report.stoppedEarly ? " (stopped after a failure)" : "")
      );
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetrying(null);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-24" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      {campaignId ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{data.campaign.name}</CardTitle>
                <Badge variant={statusVariant[data.campaign.status] || "secondary"}>
                  {data.campaign.status}
                </Badge>
              </div>
              <CardDescription>Analytics for this campaign</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total" value={data.counts.total} />
                <Stat label="Sent" value={data.counts.sent} />
                <Stat label="Failed" value={data.counts.failed} />
                <Stat label="Pending" value={data.counts.pending} />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">Sends per day</h3>
                <DailyBarChart series={data.series} />
              </div>

              {data.batchLog.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Batch history</h3>
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">Trigger</th>
                          <th className="p-2 font-medium">Sent</th>
                          <th className="p-2 font-medium">Failed</th>
                          <th className="p-2 font-medium">Stopped early?</th>
                          <th className="p-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.batchLog
                          .slice()
                          .reverse()
                          .map((b) => (
                            <tr key={b.batchNo} className="border-t">
                              <td className="p-2">#{b.batchNo}</td>
                              <td className="p-2 capitalize">{b.trigger || "manual"}</td>
                              <td className="p-2">{b.sent}</td>
                              <td className="p-2">{b.failed}</td>
                              <td className="p-2">
                                {b.stoppedEarly ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    yes
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {new Date(b.finishedAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Failed recipients ({data.failedRecipients.length})
                  </CardTitle>
                  <CardDescription>
                    Sending stops the moment one of these happens, so retry it
                    (or fix the address) before continuing.
                  </CardDescription>
                </div>
                {data.failedRecipients.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => retry(null)}
                    disabled={retrying !== null || data.campaign.status === "sending"}
                  >
                    {retrying === "all" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    Retry all
                  </Button>
                )}
              </div>
            </CardHeader>
            {data.failedRecipients.length > 0 && (
              <CardContent>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="text-left">
                        <th className="p-2 font-medium">Email</th>
                        <th className="p-2 font-medium">Error</th>
                        <th className="p-2 font-medium">Failed at</th>
                        <th className="p-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.failedRecipients.map((r) => (
                        <tr key={r._id} className="border-t">
                          <td className="p-2">{r.email}</td>
                          <td
                            className="max-w-xs truncate p-2 text-muted-foreground"
                            title={r.error}
                          >
                            {r.error || "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {r.failedAt ? new Date(r.failedAt).toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retry([r._id])}
                              disabled={
                                retrying !== null || data.campaign.status === "sending"
                              }
                            >
                              {retrying === r._id ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <RotateCcw />
                              )}
                              Retry
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5" /> Overview
              </CardTitle>
              <CardDescription>Across every campaign</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total recipients" value={data.totals.total} />
                <Stat label="Sent" value={data.totals.sent} />
                <Stat label="Failed" value={data.totals.failed} />
                <Stat label="Pending" value={data.totals.pending} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Sends per day (all campaigns)</h3>
                <DailyBarChart series={data.series} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By campaign</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {data.campaigns.length === 0 && (
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
              )}
              {data.campaigns.map((c) => (
                <button
                  key={c._id}
                  onClick={() => onOpenCampaign(c._id)}
                  className="flex items-center justify-between rounded-lg border p-3 text-left hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <Badge variant={statusVariant[c.status] || "secondary"}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.counts.sent}/{c.counts.total} sent
                      {c.counts.failed ? ` · ${c.counts.failed} failed` : ""}
                    </p>
                  </div>
                  <ChevronRight className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
