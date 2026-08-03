import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    exclude: [
      "node_modules",
      "dist",
      // Integration tests requiring a live database
      "src/test-utils/database-*.test.ts",
      "src/test-utils/migration-validation.test.ts",
      "src/test-utils/variant-types.test.ts",
      // V2 controller tests need mock infrastructure updates (TODO).
      // Scoped to *Controller* so pure-function middleware tests still run.
      "src/api/routes/v2/**/*Controller*.test.ts",
      // These three talk to a real Postgres (they delete from user_preferences
      // in afterEach) and have since rotted: they call `service.clearAllCache()`,
      // which no longer exists, and query a `feature_flag_config.key` column the
      // schema replaced with `flag_name`. Listed individually rather than as
      // `market-v2/**` so new tests in this directory are not silently skipped —
      // see feature-flag.rollout.test.ts, which covers the same rollout logic
      // against an in-memory fake (fake-knex.ts).
      "src/services/market-v2/feature-flag.service.test.ts",
      "src/services/market-v2/feature-flag.service.property.test.ts",
      "src/services/market-v2/variant.service.test.ts",
      // Hits api.uexcorp.uk for real. The deploy workflow runs `npm test` before
      // building the image, so a third-party outage would block deploys on
      // something this repo neither owns nor changed. Run it explicitly
      // (`npx vitest run src/services/attribute-import/uexcorp-api.test.ts`)
      // when touching the UEXCorp importer.
      "src/services/attribute-import/uexcorp-api.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "src/test-utils/**",
        "**/*.d.ts",
        "**/*.config.{js,ts}",
        "**/server.ts",
        "**/migrations/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    setupFiles: ["./src/test-utils/setupTests.ts"],
    testTimeout: 10000,
  },
})
