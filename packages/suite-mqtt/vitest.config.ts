import { defineConfig } from "vitest/config";

// The tests share one broker, and some tests measure time. Thus the test files run one after the other.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
