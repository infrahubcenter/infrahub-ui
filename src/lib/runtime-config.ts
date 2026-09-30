// Per-deployment settings read at REQUEST time, not build time, so one
// published image (docker.io/infrahubcenter/infrahub-ui) serves every
// customer. NEXT_PUBLIC_* variables would be frozen into the bundle by
// `next build`; these plain server-side variables are read by the root
// layout on each request and handed to the browser via
// window.__INFRAHUB_RUNTIME__ (see src/app/layout.tsx).
//
//   INFRAHUB_PLAN            community | team | business | enterprise
//   INFRAHUB_MARKETING_URL   public pricing/marketing site
//   INFRAHUB_WS_BASE_URL     API's public wss:// origin when hosted elsewhere
//
// NEXT_PUBLIC_INFRAHUB_PLAN / NEXT_PUBLIC_MARKETING_URL (.env.local) still
// work as build-time fallbacks for local development.

export type RuntimeConfig = {
  plan?: string;
  marketingUrl?: string;
  // Public wss:// origin of the API when the console is hosted on another
  // site (INFRAHUB_WS_BASE_URL) -- see lib/ws.ts.
  wsBaseUrl?: string;
};

declare global {
  interface Window {
    __INFRAHUB_RUNTIME__?: RuntimeConfig;
  }
}

export function serverRuntimeConfig(): RuntimeConfig {
  return {
    plan: process.env.INFRAHUB_PLAN || process.env.NEXT_PUBLIC_INFRAHUB_PLAN || undefined,
    marketingUrl: process.env.INFRAHUB_MARKETING_URL || process.env.NEXT_PUBLIC_MARKETING_URL || undefined,
    wsBaseUrl: process.env.INFRAHUB_WS_BASE_URL || undefined,
  };
}

export function runtimeConfig(): RuntimeConfig {
  if (typeof window !== "undefined") return window.__INFRAHUB_RUNTIME__ ?? {};
  return serverRuntimeConfig();
}

/** Inline script body that publishes the config before any bundle runs. */
export function runtimeConfigScript(config: RuntimeConfig): string {
  // JSON.stringify output can't close the <script> tag early once "<" is escaped.
  return `window.__INFRAHUB_RUNTIME__=${JSON.stringify(config).replace(/</g, "\\u003c")};`;
}
