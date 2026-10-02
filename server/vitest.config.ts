import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
