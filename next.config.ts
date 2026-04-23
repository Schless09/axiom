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
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Optional: set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in CI for source maps
});
