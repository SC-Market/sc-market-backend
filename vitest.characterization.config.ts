import { defineConfig } from "vitest/config"

/**
 * Notification characterization suite: every notification event type, end to
 * end against a real, throwaway Postgres (unix socket only, no TCP listener),
 * with recording fakes at each transport.
 *
 *   npm run test:notifications            # needs initdb/pg_ctl/psql (Postgres 14+)
 *   npm run test:notifications -- -u      # accept a deliberate behaviour change
 *
 * - global-setup starts a cluster in /tmp/notif-char-*, builds the full schema
 *   (config/postgres/*.sql + every migration) into a template database and
 *   deletes the cluster afterwards. NOTIF_CHAR_PG_SOCKET=<dir> reuses a running
 *   throwaway cluster; PG_BINDIR points at the server binaries.
 * - setup-file gives each test file its own database cloned from the
 *   template, and empties per-test tables before each test.
 * - fakes.ts records what each transport would have sent: web-push, SQS (with
 *   visibility timeout and DLQ), SES, Discord REST, webhooks (fetch) and the
 *   chat websocket. The tests live in src/services/notifications/__characterization__.
 *
 * The snapshots ARE the current behaviour. A change to who gets what, on which
 * channel, with which payload, must appear as a reviewed snapshot diff.
 * Run this before every push that touches notifications.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.char.test.ts"],
    globalSetup: ["./src/test-utils/notif-char/global-setup.ts"],
    setupFiles: ["./src/test-utils/notif-char/setup-file.ts"],
    pool: "forks",
    testTimeout: 30000,
    hookTimeout: 180000,
    // Production-shaped configuration. Every value is fake: the transports are
    // replaced by recording fakes in setup-file.ts, so nothing leaves the process.
    env: {
      NODE_ENV: "test",
      FRONTEND_URL: "https://sc-market.space",
      CDN_URL: "https://cdn.sc-market.space",
      AWS_REGION: "us-east-2",
      BACKEND_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKE",
      BACKEND_SECRET_ACCESS_KEY: "fake-secret",
      BACKEND_ROLE_ARN: "arn:aws:iam::000000000000:role/fake",
      EMAIL_QUEUE_URL: "https://sqs.us-east-2.amazonaws.com/000000000000/sc-market-email",
      DISCORD_QUEUE_URL: "https://sqs.us-east-2.amazonaws.com/000000000000/discord-queue",
      BACKEND_QUEUE_URL: "https://sqs.us-east-2.amazonaws.com/000000000000/backend-queue",
      EMAIL_FROM_ADDRESS: "noreply@sc-market.space",
      EMAIL_FROM_NAME: "SC Market",
      DISCORD_API_KEY: "fake-bot-token",
      VAPID_PUBLIC_KEY: "fake-vapid-public",
      VAPID_PRIVATE_KEY: "fake-vapid-private",
      VAPID_SUBJECT: "mailto:admin@sc-market.space",
      B2_KEY_ID: "fake-b2-key",
      B2_APP_KEY: "fake-b2-secret",
    },
  },
})
