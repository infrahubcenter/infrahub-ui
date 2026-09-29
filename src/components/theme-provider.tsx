"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMeSettings, updateMeSettings, type Theme } from "@/lib/api";

type ThemeState = {
  // The user's saved preference (SYSTEM/LIGHT/DARK) -- what the Settings
  // page's radio group shows as selected.
  theme: Theme;
  // What's actually applied to the page right now -- SYSTEM resolves to
  // whichever of these the OS currently reports.
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

const THEME_COOKIE = "theme";

function readCookieTheme(): Theme {
  if (typeof document === "undefined") return "SYSTEM";
  const match = document.cookie.match(/(?:^|; )theme=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "LIGHT" || value === "DARK" ? value : "SYSTEM";
}

function writeCookieTheme(theme: Theme) {
  // Readable (not HttpOnly) and short-lived-enough-to-not-matter if stale --
  // this cookie only ever drives the pre-hydration flash-avoidance script in
  // app/layout.tsx, never an authorization decision. A year is generous
  // since it's refreshed every time the user changes the setting anyway.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "DARK") return "dark";
  if (theme === "LIGHT") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyResolvedTheme(theme: Theme): "light" | "dark" {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seeded from the cookie the blocking inline script (app/layout.tsx) also
  // reads, so this initial render already agrees with what's on screen --
  // no flash, no hydration mismatch.
  const [theme, setThemeState] = useState<Theme>(() => readCookieTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "light" : resolveTheme(readCookieTheme())
  );

  useEffect(() => {
    // applyResolvedTheme's own job (toggling the "dark" class) is a
    // legitimate external-system side effect; resolvedTheme just mirrors
    // that result back into React state for consumers (e.g. the Settings
    // page's theme picker) -- there's no cleaner way to compute this
    // synchronously at render time, since SYSTEM's resolution depends on
    // window.matchMedia, unavailable during the server render this
    // component also runs. Same justified exception auth-provider.tsx's
    // own session-bootstrap effect already uses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedTheme(applyResolvedTheme(theme));
  }, [theme]);

  // SYSTEM tracks live OS changes (spec: "Support System/Light/Dark") --
  // only listens while SYSTEM is actually selected.
  useEffect(() => {
    if (theme !== "SYSTEM") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(applyResolvedTheme("SYSTEM"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  // One-time sync from the backend (Step 21's personal settings): a saved
  // preference from another browser/device wins over this browser's own
  // cookie-derived guess. Best-effort -- an unauthenticated 401 (not logged
  // in yet) or a network error must never block rendering.
  useEffect(() => {
    getMeSettings()
      .then((settings) => {
        setThemeState(settings.theme);
        writeCookieTheme(settings.theme);
      })
      .catch(() => {
        // Not logged in yet, or the request failed -- the cookie-derived
        // theme already applied is a perfectly fine fallback either way.
      });
    // Runs once on mount only.
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeCookieTheme(next);
    updateMeSettings({ theme: next }).catch(() => {
      // Best-effort persistence: the visual change already happened and
      // must not be rolled back just because the PUT failed -- the next
      // successful save (or the next getMeSettings sync) reconciles it.
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

// The exact inline script text app/layout.tsx runs, blocking, before
// hydration -- applies the "dark" class immediately from the same cookie
// this provider reads, so there is never a flash of the wrong theme. Kept
// here (not duplicated in layout.tsx) so the cookie name/shape has exactly
// one source of truth.
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);var t=m?decodeURIComponent(m[1]):"SYSTEM";var dark=t==="DARK"||(t!=="LIGHT"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`;
