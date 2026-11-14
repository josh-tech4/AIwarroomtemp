import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  Box,
  CheckSquare,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Sliders,
  X,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Workspace", icon: LayoutDashboard },
  { to: "/app/scenarios", label: "Scenarios", icon: FlaskConical },
  { to: "/app/decisions", label: "Decisions", icon: CheckSquare },
  { to: "/app/reports", label: "Reports", icon: FileText },
];

export function AppLayout() {
  const { user, organizations, activeOrgId, setActiveOrgId, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { businessId } = useParams<{ businessId: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const inBusinessContext = Boolean(businessId) && !location.pathname.endsWith("/new");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const bizModes = businessId
    ? [
        { to: `/app/businesses/${businessId}`, label: "Overview", icon: LayoutDashboard, end: true },
        { to: `/app/businesses/${businessId}/assumptions`, label: "Assumptions & Data", icon: Sliders, end: false },
        { to: `/app/businesses/${businessId}/components`, label: "3D Spatial Twin & Flow", icon: Box, end: false },
        { to: `/app/scenarios?business=${businessId}`, label: "Scenarios", icon: FlaskConical, end: false },
      ]
    : [];

  return (
    <div className="min-h-screen bg-surface-950 flex text-surface-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/70 lg:hidden"
        />
      )}

      {/* Left Precision Sidebar */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-surface-900 border-r border-surface-700/80 transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center gap-2.5 px-4 border-b border-surface-700/80">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold tracking-tight text-white block leading-none">
              AI WARROOM
            </span>
            <span className="text-[10px] font-mono text-surface-400">DECISION ENGINE v1.0</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-surface-400 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Organization Switcher */}
        {organizations.length > 0 && (
          <div className="px-3 py-2.5 border-b border-surface-700/80 bg-surface-850/40">
            <label htmlFor="workspaceSelect" className="block text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-1">
              Organization
            </label>
            <select
              id="workspaceSelect"
              value={activeOrgId || ""}
              onChange={(e) => setActiveOrgId(e.target.value)}
              className="w-full rounded-md bg-surface-950 border border-surface-700 px-2.5 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {activeOrg && (
              <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-surface-400">
                <span>ROLE</span>
                <span className="uppercase text-brand-400">{activeOrg.current_user_role}</span>
              </div>
            )}
          </div>
        )}

        {/* Primary Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
            Platform
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-surface-800 text-white border border-surface-700"
                      : "text-surface-400 hover:bg-surface-850 hover:text-surface-100 border border-transparent"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-400" : "text-surface-500"}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {inBusinessContext && (
            <div className="pt-4">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                Active Model
              </p>
              <div className="space-y-0.5">
                {bizModes.map((m) => {
                  const Icon = m.icon;
                  return (
                    <NavLink
                      key={m.label}
                      to={m.to}
                      end={m.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-brand-600/15 text-brand-300 border border-brand-500/30"
                            : "text-surface-400 hover:bg-surface-850 hover:text-surface-100 border border-transparent"
                        }`
                      }
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* System / User Footer */}
        <div className="border-t border-surface-700/80 p-3 space-y-2.5 bg-surface-900">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-800 border border-surface-700 text-brand-400 text-xs font-mono font-bold">
              {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-surface-100">{user?.full_name || user?.email}</p>
              <p className="truncate text-[10px] font-mono text-surface-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md border border-surface-800 bg-surface-950 px-2.5 py-1.5 text-xs font-medium text-surface-400 hover:border-surface-700 hover:text-danger-400 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Studio Header */}
        <header className="no-print sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-surface-700/80 bg-surface-900/95 px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md border border-surface-700 p-1.5 text-surface-400 hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            {inBusinessContext && bizModes.length > 0 ? (
              <nav aria-label="Business Model Workbench Modes" className="hidden sm:flex items-center gap-1 rounded-md bg-surface-950 border border-surface-800 p-0.5">
                {bizModes.map((m) => {
                  const Icon = m.icon;
                  return (
                    <NavLink
                      key={m.label}
                      to={m.to}
                      end={m.end}
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-surface-800 text-white border border-surface-700"
                            : "text-surface-400 hover:text-surface-200 border border-transparent"
                        }`
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </NavLink>
                  );
                })}
              </nav>
            ) : (
              <span className="text-xs font-mono text-surface-400 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-accent-400" />
                Virtual Business Simulation & Decision Intelligence Platform
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-surface-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
              DETERMINISTIC ENGINE
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
            <Outlet />
          </div>
        </main>

        <footer className="no-print border-t border-surface-800 bg-surface-900/60 py-2 px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-surface-500">
            <span>
              AI WarRoom — Structured scenario projections from declared assumptions, never guaranteed forecasts.
            </span>
            <span className="font-mono">MVP v1.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
