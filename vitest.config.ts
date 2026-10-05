import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig({
  ...viteConfig,
  test: {
    // Resolve before the adapter's randomized external module so vi.mock can
    // replace the Workers boundary without booting a local Cloudflare proxy.
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./tests/helpers/cloudflare-workers.ts", import.meta.url),
      ),
    },
    globals: true,
    setupFiles: ["./tests/setup-cloudflare.ts"],
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
