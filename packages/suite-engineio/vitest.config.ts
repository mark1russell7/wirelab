import { defineConfig } from "vitest/config";

// Some tests measure time (the heartbeat, the time limit of a request). Thus the test files run one after the other.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
