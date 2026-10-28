import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      TEST_PREVIEW: "1",
      TEST_BASE_URL: "http://127.0.0.1:4173",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
