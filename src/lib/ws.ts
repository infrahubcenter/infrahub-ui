// WebSocket addressing for a console hosted on a different site from its
// API (e.g. the console on Vercel, the API on the laptop behind ngrok).
//
// REST calls go through the console's own /api proxy (app/api/[...path]),
// so the session cookie stays on the console's domain. WebSockets can't be
// proxied by Vercel, so the browser opens them directly to the API at
// INFRAHUB_WS_BASE_URL -- where that cookie isn't sent. Instead each socket
// carries a short-lived WebSocket ticket (?ws_ticket=, valid 2 minutes and
// only for WebSocket upgrades -- see the API's services.WSTicketAudience),
// fetched through the proxy and refreshed every minute while signed in.
//
// Without INFRAHUB_WS_BASE_URL (console and API on one origin, e.g. behind
// the gateway) none of this applies: sockets stay relative and use the
// cookie, exactly as before.

import { runtimeConfig } from "./runtime-config";

let ticket: string | null = null;

function wsOrigin(): string | undefined {
  const base = runtimeConfig().wsBaseUrl;
  return base ? base.replace(/\/+$/, "") : undefined;
}

// Base for every WebSocket URL: the configured API origin, or the same
// origin as REST (apiBase, "" = relative) with the scheme switched to ws.
export function wsBaseFor(apiBase: string): string {
  return wsOrigin() ?? apiBase.replace(/^http/, "ws");
}

export function withWsTicket(url: string): string {
  if (!wsOrigin() || !ticket) return url;
  return `${url}${url.includes("?") ? "&" : "?"}ws_ticket=${encodeURIComponent(ticket)}`;
}

export async function refreshWsTicket(): Promise<void> {
  if (!wsOrigin()) return;
  try {
    const res = await fetch("/api/auth/ws-ticket", { method: "POST", credentials: "include" });
    if (res.ok) ticket = ((await res.json()) as { ticket?: string }).ticket ?? null;
  } catch {
    // Keep the previous ticket; the next refresh retries.
  }
}

// Starts the refresh loop; returns a stop function.
export function startWsTicketRefresh(): () => void {
  if (!wsOrigin()) return () => {};
  const id = setInterval(() => void refreshWsTicket(), 60_000);
  return () => clearInterval(id);
}

export function clearWsTicket(): void {
  ticket = null;
}
