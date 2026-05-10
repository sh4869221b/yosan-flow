import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 4173;
const xdgConfigHome = `${process.cwd()}/.tmp-xdg-config`;
const persistDir = `${process.cwd()}/.tmp-wrangler-state`;
const e2eEnv = [
  "COREPACK_HOME=/tmp/corepack",
  "PNPM_HOME=/tmp/pnpm",
  "XDG_DATA_HOME=/tmp",
  `XDG_CONFIG_HOME=${xdgConfigHome}`,
  "YOSAN_FLOW_E2E_RESET_TOKEN=local-e2e-reset-token",
].join(" ");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: [
      "bash -lc '",
      `rm -rf "${persistDir}" "${xdgConfigHome}"`,
      ` && mkdir -p "${persistDir}" "${xdgConfigHome}/.wrangler/logs"`,
      ` && ${e2eEnv} pnpm build`,
      ` && ${e2eEnv} pnpm wrangler dev --local --persist-to "${persistDir}" --ip ${host} --port ${port} --var YOSAN_FLOW_E2E_RESET_TOKEN:local-e2e-reset-token`,
      "'",
    ].join(""),
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://${host}:${port}/`,
  },
});
