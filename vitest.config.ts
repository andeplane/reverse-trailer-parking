import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    environmentMatchGlobs: [
      ["**/*hud*/**", "jsdom"],
      ["**/*overlay*", "jsdom"],
      ["**/*input*", "jsdom"],
      ["**/*hud*", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/main.ts"],
      thresholds: {
        lines: 80,
      },
    },
  },
});
