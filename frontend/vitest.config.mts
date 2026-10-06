import { defineConfig } from "vitest/config";

/**
 * Unit tests (pure helpers) run in Node; component tests opt into jsdom with a
 * `// @vitest-environment jsdom` comment at the top of the file.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    server: {
      deps: {
        // ESM packages that import `next/*` without file extensions.
        inline: ["next-intl", "use-intl"],
      },
    },
  },
});
