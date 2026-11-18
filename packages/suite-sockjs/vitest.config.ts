import { defineConfig } from "vitest/config";

// Some tests measure time (the open frame, the time limit of a transport). Thus the test files run one after the other.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
