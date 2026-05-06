import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig({
  ...viteConfig,
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: ["src/lib/server/**/*.ts", "src/routes/api/**/*.ts"],
      exclude: ["src/lib/server/db/d1-types.ts", "src/routes/api/__test/**"],
    },
  },
});
