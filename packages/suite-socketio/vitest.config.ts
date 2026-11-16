import { defineConfig } from "vitest/config";

// Some tests measure time (the delays of the scripted server). Thus the test files start one after the other.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
