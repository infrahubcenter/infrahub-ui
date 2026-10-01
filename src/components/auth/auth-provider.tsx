"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, getMe, logout as apiLogout, msSinceSessionRenewal, refreshSession, type User } from "@/lib/api";
import { clearWsTicket, refreshWsTicket, startWsTicketRefresh } from "@/lib/ws";

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      // A console hosted apart from its API needs a WebSocket ticket before
      // any live view opens a socket (no-op otherwise -- see lib/ws.ts).
      await refreshWsTicket();
      setUser(me);
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return null;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Session bootstrap: ask the backend who (if anyone) the auth cookie
    // belongs to. This is the one legitimate "fetch on mount" case the
    // set-state-in-effect rule doesn't have a better pattern for -- there is
    // no external store to subscribe to, just a one-time identity check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Runs once on mount; `refresh` is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the WebSocket ticket fresh while signed in.
  useEffect(() => {
    if (!user) return;
    return startWsTicketRefresh();
  }, [user]);

  // Stay signed in until sign-out: renew the session before the 15-minute
  // access cookie runs out (live views and WebSockets need it valid), and as
  // soon as the tab is visible again after sleep or a long break.
  useEffect(() => {
    if (!user) return;
    const RENEW_EVERY = 10 * 60_000;
    const renewIfDue = () => {
      if (msSinceSessionRenewal() >= RENEW_EVERY) void refreshSession();
    };
    const timer = setInterval(renewIfDue, 60_000);
    const onVisible = () => document.visibilityState === "visible" && renewIfDue();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", renewIfDue);
    window.addEventListener("online", renewIfDue);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", renewIfDue);
      window.removeEventListener("online", renewIfDue);
    };
  }, [user]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      clearWsTicket();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
