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
      // NOTE: there is deliberately no `src/services/market-v2/**` entry here.
      // A directory-wide exclusion used to cover this path, and the tests behind
      // it rotted unnoticed for months — they called a `clearAllCache()` that had
      // been deleted and queried a `feature_flag_config.key` column the schema had
      // renamed to `flag_name`. Prefer `describe.skip` with a reason in the test
      // file over an exclusion here, so a broken test stays visible.
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
