import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a platform binary that must not be bundled by webpack.
  // fluent-ffmpeg (if re-added) also needs this treatment.
  serverExternalPackages: ["ffmpeg-static"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Middleware clones the body for auth refresh; default cap is 10MB and truncates
    // Server Action posts before `bodySizeLimit` is applied — breaks large FormData uploads.
    middlewareClientMaxBodySize: "100mb",
    // Next 15.5+ internal proxy for Server Actions uses a separate default (10MB).
    proxyClientMaxBodySize: "100mb",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Optional: set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in CI for source maps
});
