"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ensureCsrfToken, getCsrfToken, setCsrfToken } from "@/lib/auth";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: "grid" },
  { label: "Patient Registry", href: "/patients", icon: "users" },
  { label: "Data Integration", href: "/integrations", icon: "exchange" },
  { label: "Data Quality", href: "/quality", icon: "quality" },
  { label: "Audit & Reports", href: "/audit", icon: "audit" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    patient: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 11v6M9 14h6"/></>,
    exchange: <><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    quality: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [account, setAccount] = useState<{ displayName: string; email: string } | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOutsideMenu(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutsideMenu);
    return () => document.removeEventListener("pointerdown", closeOutsideMenu);
  }, [accountMenuOpen]);

  useEffect(() => {
    let active = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    async function checkSession() {
      try {
        const response = await fetch(`${apiUrl}/api/v1/auth/me`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;

        if (!response.ok) {
          setAuthenticated(false);
          setAccount(null);
          if (pathname !== "/login") {
            router.replace("/login");
          }
          return;
        }

        const body = (await response.json()) as {
          data?: { user?: { displayName?: string; email?: string } };
        };
        if (!active) return;
        const user = body.data?.user;
        setAccount(
          user?.displayName && user.email
            ? { displayName: user.displayName, email: user.email }
            : null,
        );
        setAuthenticated(true);
        if (pathname === "/" || pathname === "/login") {
          router.replace("/dashboard");
        }
      } catch {
        if (!active) return;
        setAuthenticated(false);
        if (pathname !== "/login") {
          router.replace("/login");
        }
      }
    }

    void checkSession();
    const keepAlive = window.setInterval(() => {
      void fetch(`${apiUrl}/api/v1/auth/me`, {
        credentials: "include",
        cache: "no-store",
      }).then((response) => {
        if (active && !response.ok && pathname !== "/login") {
          setAuthenticated(false);
          setAccount(null);
          router.replace("/login");
        }
      }).catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(keepAlive);
    };
  }, [pathname, router]);

  async function logout() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    try {
      await ensureCsrfToken(apiUrl);
      await fetch(`${apiUrl}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: getCsrfToken()
          ? { "x-csrf-token": getCsrfToken() ?? "" }
          : {},
      });
    } finally {
      setCsrfToken(null);
      router.replace("/login");
    }
  }

  const accountName = account?.displayName ?? "Staff account";
  const accountInitials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "U";

  if (isLogin) return <>{children}</>;
  if (authenticated === false) {
    return <main className="auth-loading" role="status">Redirecting to sign in...</main>;
  }
  if (authenticated === null) {
    return <main className="auth-loading" role="status">Checking secure session...</main>;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>+</span></div>
          <div><strong>MediSync</strong><span>360</span></div>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href ||
                (item.href === "/patients" && /^\/patients\/?$/.test(pathname))
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="demo-status"><span className="status-dot live" /> Demo environment</div>
          <div className="account-mini">
            <div className="avatar">{accountInitials}</div>
            <div><strong>{accountName}</strong><span>{account?.email ?? "Signed-in staff"}</span></div>
          </div>
        </div>
      </aside>

      {menuOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}

      <div className="app-main">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div className="facility-context">
            <span>Clinical Operations</span>
            <strong>Enterprise Workspace</strong>
          </div>
          <div className="topbar-actions">
            <span className="topbar-source"><span className="status-dot live" /> Simulated sources</span>
            <div
              className="account-menu"
              ref={accountMenuRef}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setAccountMenuOpen(false);
                  accountButtonRef.current?.focus();
                }
              }}
            >
              <button
                ref={accountButtonRef}
                className="top-avatar"
                type="button"
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                {accountInitials}
              </button>
              {accountMenuOpen ? (
                <div className="account-popover" id="account-menu-options" aria-label="Account options">
                  <div className="account-popover-identity">
                    <strong>{accountName}</strong>
                    <span>{account?.email ?? "Signed-in staff"}</span>
                  </div>
                  <Link href="/settings" onClick={() => setAccountMenuOpen(false)}>Settings</Link>
                  <button type="button" onClick={() => void logout()}>Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="workspace">{children}</div>
      </div>
    </div>
  );
}
