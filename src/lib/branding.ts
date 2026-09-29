import { runtimeConfig } from "./runtime-config";

// Single source of truth for the product name/description shown
// throughout the UI (sidebar, header, login, browser tab, error pages)
// and in Next.js metadata (src/app/layout.tsx) -- never hardcode the
// product name a second time elsewhere.
export const APP_NAME = "Infra Hub Center";
export const APP_DESCRIPTION = "Infrastructure Monitoring & Operations Platform";

/** Formats a browser tab title as "Infra Hub Center | <page>", or the
 * bare product name when no page-specific label applies. */
export function pageTitle(label?: string): string {
  return label && label !== APP_NAME ? `${APP_NAME} | ${label}` : APP_NAME;
}

// Product release shown in the sidebar footer (and on the marketing site,
// infrahub-site/src/lib/product.ts). Bump both together on each release;
// package.json's "version" is kept in sync with it.
export const APP_VERSION = "1.0.0";
export const APP_RELEASE_CHANNEL = "Stable";

// Public marketing / pricing site (infrahub-site/). Linked from Plans &
// Billing's "Compare plans" button. Set per deployment with
// INFRAHUB_MARKETING_URL (read at runtime, see lib/runtime-config.ts).
export const MARKETING_URL = runtimeConfig().marketingUrl ?? "http://localhost:3002";
