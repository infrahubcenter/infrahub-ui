import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces only the files a production server actually needs into
  // .next/standalone (including a minimal server.js) -- see
  // docs/deployment.md and infrahub-ui/Dockerfile, which depend on this
  // to build a lean production image without installing node_modules
  // into it. Has no effect on `next dev`/`next start` local development.
  output: "standalone",
  // `next dev` checks the request's Origin/Referer *hostname* (port is
  // NOT part of the check -- see next/dist/server/lib/router-utils/
  // block-cross-site-dev.js) against this list plus its own always-on
  // "localhost"/"**.localhost" default, and silently 403s dev resources
  // (JS chunks, HMR, RSC fetches) for anything else. "127.0.0.1" isn't
  // covered by that default, so it needs listing explicitly for
  // dev-proxy.mjs (which proxies 127.0.0.1:4000 -> this server on
  // 127.0.0.1:3001, forwarding the browser's original Origin/Referer
  // as-is) to work when the app is opened directly at 127.0.0.1:4000
  // rather than through the ngrok tunnel below. Harmless in production
  // (`next start`/standalone), which doesn't have this dev-only
  // protection at all.
  allowedDevOrigins: ["dipping-sympathy-stadium.ngrok-free.dev", "127.0.0.1"],
};

export default nextConfig;
