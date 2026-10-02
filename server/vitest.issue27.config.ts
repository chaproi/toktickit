import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/lab-03/issue27-global-setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
