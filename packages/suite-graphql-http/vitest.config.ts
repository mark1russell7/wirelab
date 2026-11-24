import { defineConfig } from "vitest/config";

// Each check starts its own scripted server on a free port. The test files run one after the other, so that the
// log of the evidence keeps the order of the checks.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
