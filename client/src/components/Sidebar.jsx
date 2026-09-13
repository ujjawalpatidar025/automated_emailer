import { motion, AnimatePresence } from "framer-motion";
import { Mail, LayoutList, PlusCircle, BarChart3, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { key: "list", label: "Campaigns", icon: LayoutList },
  { key: "create", label: "Create campaign", icon: PlusCircle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function SidebarContent({ activeKey, onNavigate, user, theme, onToggleTheme, onLogout }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm">
          <Mail className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Automator Email</p>
          <p className="truncate text-xs text-muted-foreground">Campaign manager</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const active = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              className={cn(
                "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-lg bg-brand-gradient shadow"
                  transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                />
              )}
              <Icon className="relative z-10 size-4 shrink-0" />
              <span className="relative z-10 truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t p-2.5">
        <div className="flex items-center gap-2 rounded-lg p-1.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
            title={user.email}
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.gmailAddress}</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Button variant="outline" size="sm" className="flex-1" onClick={onLogout}>
            <LogOut className="size-4" /> Log out
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  activeKey,
  onNavigate,
  user,
  theme,
  onToggleTheme,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) {
  const handleNavigate = (key) => {
    onNavigate(key);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Desktop — permanent, pinned to the viewport; only <main> scrolls */}
      <aside className="hidden h-full w-64 shrink-0 border-r bg-card lg:block">
        <SidebarContent
          activeKey={activeKey}
          onNavigate={handleNavigate}
          user={user}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
        />
      </aside>

      {/* Mobile — off-canvas drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onCloseMobile}
            />
            <motion.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card shadow-2xl lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              <div className="flex justify-end p-2">
                <Button variant="ghost" size="icon" onClick={onCloseMobile} aria-label="Close menu">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="h-[calc(100%-3rem)]">
                <SidebarContent
                  activeKey={activeKey}
                  onNavigate={handleNavigate}
                  user={user}
                  theme={theme}
                  onToggleTheme={onToggleTheme}
                  onLogout={onLogout}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
