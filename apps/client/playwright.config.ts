import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * E2E tests run against the production server (which serves the built client).
 * `npm run test:e2e` builds the client first. In the dev container the
 * pre-installed Chromium is used via PW_CHROMIUM_PATH or /opt/pw-browsers.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 1,
  workers: 1, // tests share one game server
  use: {
    baseURL: "http://localhost:8787",
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } }
      : { launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } }),
  },
  webServer: {
    command: "npm run start --workspace @ddd/server",
    cwd: "../..",
    url: "http://localhost:8787/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
