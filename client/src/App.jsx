import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  LayoutList,
  BarChart3,
  LogOut,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import CampaignForm from "@/components/CampaignForm";
import CampaignList from "@/components/CampaignList";
import CampaignDetail from "@/components/CampaignDetail";
import AnalyticsPage from "@/components/AnalyticsPage";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

export default function App() {
  const { theme, toggle } = useTheme();
  const { user, loading: authLoading, login, register, logout } = useAuth();
  const [authView, setAuthView] = useState("login");

  const [campaigns, setCampaigns] = useState([]);
  const [view, setView] = useState("campaigns"); // "campaigns" | "detail" | "analytics"
  const [selected, setSelected] = useState(null); // campaignId for "detail", or scope for "analytics"
  const [health, setHealth] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { campaigns } = await api.listCampaigns();
      setCampaigns(campaigns);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await api.mailerHealth();
      setHealth({ ok: true, ...res });
    } catch (err) {
      setHealth({ ok: false, error: err.message });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    checkHealth();
    setView("campaigns");
    setSelected(null);
  }, [user, refresh, checkHealth]);

  function openCampaign(id) {
    setSelected(id);
    setView("detail");
  }

  function openAnalytics(id = null) {
    setSelected(id);
    setView("analytics");
  }

  async function handleDelete(c) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    try {
      await api.deleteCampaign(c._id);
      toast.success("Campaign deleted");
      if (selected === c._id) {
        setSelected(null);
        setView("campaigns");
      }
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleLogout() {
    if (!confirm("Log out of Automator Email?")) return;
    await logout();
    toast.success("Logged out");
  }

  async function handleToggleSchedule(c, enabled) {
    try {
      await api.updateCampaign(c._id, {
        schedule: {
          enabled,
          time: c.schedule?.time,
          count: c.schedule?.count,
        },
      });
      toast.success(
        enabled
          ? `"${c.name}" scheduled again for ${c.schedule.time} daily`
          : `Schedule paused for "${c.name}"`
      );
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  // ── Auth gate ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster richColors position="top-right" theme={theme} />
        <AnimatePresence mode="wait">
          {authView === "login" ? (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Login onLogin={login} onSwitchToRegister={() => setAuthView("register")} />
            </motion.div>
          ) : (
            <motion.div
              key="register"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Register onRegister={register} onSwitchToLogin={() => setAuthView("login")} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Main app ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30">
      <Toaster richColors position="top-right" theme={theme} />

      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-white">
              <Mail className="size-4" />
            </span>
            <h1 className="text-lg font-semibold">Automator Email</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              <Button
                variant={view !== "analytics" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setView("campaigns");
                }}
              >
                <LayoutList />
                <span className="hidden sm:inline">Campaigns</span>
              </Button>
              <Button
                variant={view === "analytics" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => openAnalytics(null)}
              >
                <BarChart3 />
                <span className="hidden sm:inline">Analytics</span>
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refresh();
                checkHealth();
              }}
            >
              <RefreshCw />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <ThemeToggle theme={theme} onToggle={toggle} />

            <div className="ml-1 flex items-center gap-2 border-l pl-2">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                title={user.email}
              >
                {initials(user.name)}
              </span>
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.gmailAddress}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container grid gap-6 py-6">
        {health && (
          <div
            className={`flex min-w-0 items-center gap-2 rounded-lg border p-3 text-sm ${
              health.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {health.ok ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
            )}
            <span className="min-w-0 break-words">
              {health.ok
                ? `Mailer ready — sending as ${health.gmailAddress}.`
                : `Mailer not configured: ${health.error}`}
            </span>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            className="min-w-0"
            key={view === "detail" ? `detail-${selected}` : view === "analytics" ? `analytics-${selected}` : "campaigns"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {view === "detail" && selected ? (
              <CampaignDetail
                campaignId={selected}
                onBack={() => {
                  setSelected(null);
                  setView("campaigns");
                }}
                onChanged={refresh}
                onOpenAnalytics={() => openAnalytics(selected)}
              />
            ) : view === "analytics" ? (
              <AnalyticsPage
                campaignId={selected}
                onBack={() => {
                  setSelected(null);
                  setView("campaigns");
                }}
                onOpenCampaign={openCampaign}
              />
            ) : (
              <div className="grid gap-6">
                <div className="min-w-0">
                  <CampaignForm
                    onCreated={(c) => {
                      refresh();
                      openCampaign(c._id);
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <CampaignList
                    campaigns={campaigns}
                    onOpen={openCampaign}
                    onDelete={handleDelete}
                    onToggleSchedule={handleToggleSchedule}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
