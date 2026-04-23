import * as Sentry from "@sentry/nextjs";
import { initSentry } from "@/lib/sentry/init";

initSentry();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
