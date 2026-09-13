import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, CheckCircle2, AlertTriangle, Menu, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import Sidebar from "@/components/Sidebar";
import CampaignForm from "@/components/CampaignForm";
import CampaignList from "@/components/CampaignList";
import CampaignDetail from "@/components/CampaignDetail";
import AnalyticsPage from "@/components/AnalyticsPage";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

const PAGE_TITLES = {
  list: "Campaigns",
  create: "Create campaign",
  detail: "Campaign",
  analytics: "Analytics",
};

export default function App() {
  const { theme, toggle } = useTheme();
  const { user, loading: authLoading, login, register, logout } = useAuth();
  const [authView, setAuthView] = useState("login");

  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("list"); // "list" | "create" | "detail" | "analytics"
  const [selected, setSelected] = useState(null); // campaignId for "detail", or scope for "analytics"
  const [health, setHealth] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { campaigns } = await api.listCampaigns();
      setCampaigns(campaigns);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCampaignsLoading(false);
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
    setCampaignsLoading(true);
    refresh();
    checkHealth();
    setView("list");
    setSelected(null);
  }, [user, refresh, checkHealth]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), checkHealth()]);
    setRefreshing(false);
    toast.success("Refreshed");
  }

  function navigate(key) {
    setSelected(null);
    setView(key);
  }

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
        setView("list");
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
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Loader2 className="size-5 animate-spin" />
          Loading…
        </motion.div>
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

  const activeNavKey = view === "detail" ? "list" : view;

  // ── Main app ───────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-muted/30">
      <Toaster richColors position="top-right" theme={theme} />

      <Sidebar
        activeKey={activeNavKey}
        onNavigate={navigate}
        user={user}
        theme={theme}
        onToggleTheme={toggle}
        onLogout={handleLogout}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {PAGE_TITLES[view]}
          </h1>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </header>

        <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 p-4 sm:p-6">
          {health && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
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
            </motion.div>
          )}

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              className="min-w-0"
              key={view === "detail" ? `detail-${selected}` : view === "analytics" ? `analytics-${selected}` : view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, position: "absolute" }}
              transition={{ duration: 0.18 }}
            >
              {view === "detail" && selected ? (
                <CampaignDetail
                  campaignId={selected}
                  onBack={() => navigate("list")}
                  onChanged={refresh}
                  onOpenAnalytics={() => openAnalytics(selected)}
                />
              ) : view === "analytics" ? (
                <AnalyticsPage
                  campaignId={selected}
                  onBack={() => navigate("list")}
                  onOpenCampaign={openCampaign}
                />
              ) : view === "create" ? (
                <CampaignForm
                  onCreated={(c) => {
                    refresh();
                    openCampaign(c._id);
                  }}
                />
              ) : (
                <CampaignList
                  campaigns={campaigns}
                  loading={campaignsLoading}
                  onOpen={openCampaign}
                  onDelete={handleDelete}
                  onToggleSchedule={handleToggleSchedule}
                  onCreateNew={() => navigate("create")}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
