import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a platform binary that must not be bundled by webpack.
  // fluent-ffmpeg (if re-added) also needs this treatment.
  serverExternalPackages: ["ffmpeg-static"],
  // Ensure the ffmpeg-static binary is copied into serverless traces (otherwise
  // runtime gets ENOENT on /var/task/.../ffmpeg). Lambda users can instead set FFMPEG_PATH.
  outputFileTracingIncludes: {
    "/api/claims/analyze": ["./node_modules/ffmpeg-static/**/*"],
    "/api/claims/[id]/video": ["./node_modules/ffmpeg-static/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Middleware clones the body for auth refresh; default cap is 10MB and truncates
    // Server Action posts before `bodySizeLimit` is applied — breaks large FormData uploads.
    middlewareClientMaxBodySize: "100mb",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Optional: set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in CI for source maps
});
