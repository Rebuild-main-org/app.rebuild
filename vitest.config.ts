import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws outside an RSC; stub it so server libs are testable.
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
})
