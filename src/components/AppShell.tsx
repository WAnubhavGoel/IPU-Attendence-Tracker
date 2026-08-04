"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

// SVG Icons
function DashIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#6366f1" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#6366f1" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  );
}

function CalIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#6366f1" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const isAuthPage = pathname === "/login";
  if (isAuthPage || !session) return <>{children}</>;

  const initials = session.user?.name
    ? session.user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : session.user?.email?.[0]?.toUpperCase() || "?";

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/login";
  };

  const navItems = [
    { href: "/dashboard",       label: "Today",     Icon: DashIcon },
    { href: "/analytics",       label: "Stats",     Icon: ChartIcon },
    { href: "/timetable/setup", label: "Timetable", Icon: CalIcon },
  ];

  return (
    <div className="page-wrapper">
      {/* Top bar */}
      <header className="top-bar">
        <Link href="/dashboard" className="top-bar-logo">
          <div className="logo-icon">
            <BookIcon />
          </div>
          <span className="logo-name">IPU Tracker</span>
        </Link>

        <div className="top-bar-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Desktop nav links */}
          <nav className="desktop-nav" style={{ gap: 4 }}>
            {navItems.map(({ href, label, Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 10, textDecoration: "none",
                    fontSize: "0.82rem", fontWeight: 600, transition: "all 0.2s",
                    background: active ? "rgba(99,102,241,0.15)" : "transparent",
                    color: active ? "#818cf8" : "var(--text-secondary)",
                    border: active ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                  }}
                >
                  <Icon active={active} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* User Badge */}
          <div
            className="avatar-btn"
            style={{ cursor: "default" }}
            title={session.user?.email || session.user?.name || "Logged in"}
          >
            {initials}
          </div>

          {/* Explicit Sign Out / Log Out Button */}
          <button
            onClick={handleSignOut}
            className="btn btn-secondary btn-sm"
            style={{
              padding: "6px 12px",
              fontSize: "0.78rem",
              fontWeight: 600,
              gap: 6,
              display: "flex",
              alignItems: "center",
              borderColor: "rgba(239,68,68,0.3)",
              color: "#f87171",
              background: "rgba(239,68,68,0.08)",
            }}
          >
            <LogOutIcon />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`bottom-nav-item ${active ? "active" : ""}`}>
              <Icon active={active} />
              <span>{label}</span>
              <div className="bottom-nav-dot" />
            </Link>
          );
        })}
        <button
          onClick={handleSignOut}
          className="bottom-nav-item"
          style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer" }}
        >
          <LogOutIcon />
          <span>Log Out</span>
        </button>
      </nav>
    </div>
  );
}
