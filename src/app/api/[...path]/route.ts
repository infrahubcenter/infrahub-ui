// Server-side /api proxy for a console hosted apart from its API (e.g. on
// Vercel, with the API on the laptop behind ngrok).
//
// Browsers only ever call this console's own /api/*, so the session cookie
// stays first-party on the console's domain and the backend's address and
// shared key never reach the browser. Each request is forwarded to
// INFRAHUB_BACKEND_URL with X-Infrahub-Proxy-Key: INFRAHUB_PROXY_KEY, which
// the API requires on every non-WebSocket request when its own
// INFRAHUB_PROXY_KEY is set (see the API's middleware.RequireProxyKey).
// WebSockets can't be proxied here -- they go direct with a ticket (see
// lib/ws.ts).
//
// Behind the gateway (Docker Compose / Kubernetes) /api/* never reaches
// this route at all: the gateway sends it straight to the API.

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Hop-by-hop / transport headers that must not be forwarded as-is.
const DROP_REQUEST = ["host", "connection", "content-length", "accept-encoding", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"];
const DROP_RESPONSE = ["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const backend = process.env.INFRAHUB_BACKEND_URL?.replace(/\/+$/, "");
  if (!backend) {
    return Response.json({ error: "INFRAHUB_BACKEND_URL is not configured" }, { status: 502 });
  }

  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${backend}/api/${path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  for (const h of DROP_REQUEST) headers.delete(h);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  // ngrok's free plan answers browser-looking requests with a warning page
  // unless this header is present.
  headers.set("ngrok-skip-browser-warning", "1");
  const key = process.env.INFRAHUB_PROXY_KEY;
  if (key) headers.set("x-infrahub-proxy-key", key);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Backend is unreachable -- is the API running?" }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE.includes(name.toLowerCase())) out.set(name, value);
  });
  // Several Set-Cookie headers (access + refresh token) must stay separate.
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
