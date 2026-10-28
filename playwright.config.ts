import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  outputDir: ".local/test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "reports/e2e/html" }],
    ["json", { outputFile: ".local/reports/e2e-results.json" }],
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:5173",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.TEST_PREVIEW ? "npm run preview" : "npm run dev",
    url: process.env.TEST_BASE_URL || "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
