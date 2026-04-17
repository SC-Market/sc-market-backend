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
      // V2 controller tests need mock infrastructure updates (TODO)
      "src/api/routes/v2/**/*.test.ts",
      // V2 service tests need mock knex improvements (TODO)
      "src/services/market-v2/**/*.test.ts",
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
