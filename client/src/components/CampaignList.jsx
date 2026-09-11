import { motion } from "framer-motion";
import { Trash2, ChevronRight, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const statusVariant = {
  draft: "secondary",
  sending: "default",
  paused: "warning",
  completed: "success",
  failed: "destructive",
};

export default function CampaignList({ campaigns, onOpen, onDelete }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaigns</CardTitle>
        <CardDescription>
          {campaigns.length
            ? `${campaigns.length} campaign(s)`
            : "No campaigns yet — create one above."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {campaigns.map((c, i) => {
          const { total = 0, sent = 0, failed = 0 } = c.counts || {};
          return (
            <motion.div
              key={c._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.04 }}
              className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <Badge variant={statusVariant[c.status] || "secondary"}>
                    {c.status === "sending" && (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    )}
                    {c.status}
                  </Badge>
                  {c.schedule?.enabled && (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="size-3" />
                      {c.schedule.time} · {c.schedule.count}/day
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {c.subject}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sent}/{total} sent
                  {failed ? ` · ${failed} failed` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(c)}
                  aria-label="Delete campaign"
                >
                  <Trash2 className="text-destructive" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => onOpen(c._id)}>
                  Open
                  <ChevronRight />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
