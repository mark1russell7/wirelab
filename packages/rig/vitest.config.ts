import { defineConfig } from "vitest/config";

export default defineConfig({
  // graphql 16 has a `module` field (index.mjs) and a `main` field (index.js). Vite takes `module`, and Node takes `main`
  // for graphql-ws. Two copies of graphql refuse the schemas of each other, so the rig uses the copy of Node.
  resolve: { alias: [{ find: /^graphql$/, replacement: "graphql/index.js" }] },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
