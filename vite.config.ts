import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Vitest stubs the Workers boundary. The deployment adapter would start a
// Wrangler platform proxy as soon as Vitest creates its server.
const adapter =
  process.env.VITEST === "true"
    ? undefined
    : (await import("@sveltejs/adapter-cloudflare")).default();

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter,
      preprocess: vitePreprocess(),
      // Preserve the pre-migration background polling behavior.
      version: { pollInterval: 0 },
    }),
  ],
});
