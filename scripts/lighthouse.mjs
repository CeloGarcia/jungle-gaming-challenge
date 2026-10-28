import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import config from "../lighthouse.config.mjs";

fs.mkdirSync("reports/lighthouse", { recursive: true });
const base = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
let preview, chrome;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const available = async () => {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
};
try {
  if (!(await available())) {
    preview = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4173",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    for (let i = 0; i < 40 && !(await available()); i++) await wait(250);
    if (!(await available()))
      throw new Error(
        "O preview de produção não iniciou. Execute npm run build primeiro.",
      );
  }
  chrome = await chromeLauncher.launch({
    chromeFlags: [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const runs = [];
  for (const [page, path] of [
    ["home", "/"],
    ["detail", "/nft/nft-1"],
  ])
    for (const profile of ["mobile", "desktop"])
      for (let run = 1; run <= 3; run++) {
        const flags = {
          port: chrome.port,
          logLevel: "error",
          output: ["html", "json"],
          onlyCategories: [
            "performance",
            "accessibility",
            "best-practices",
            "seo",
          ],
          ...(profile === "desktop"
            ? {
                preset: "desktop",
                formFactor: "desktop",
                screenEmulation: {
                  mobile: false,
                  width: 1440,
                  height: 900,
                  deviceScaleFactor: 1,
                  disabled: false,
                },
                throttling: {
                  rttMs: 40,
                  throughputKbps: 10240,
                  cpuSlowdownMultiplier: 1,
                  requestLatencyMs: 0,
                  downloadThroughputKbps: 0,
                  uploadThroughputKbps: 0,
                },
              }
            : {}),
        };
        const result = await lighthouse(base + path, flags, config);
        if (!result) throw new Error("Lighthouse não retornou um resultado.");
        const name = `${page}-${profile}-${run}`;
        fs.writeFileSync(`reports/lighthouse/${name}.html`, result.report[0]);
        fs.writeFileSync(`reports/lighthouse/${name}.json`, result.report[1]);
        const entry = {
          page,
          profile,
          run,
          scores: Object.fromEntries(
            Object.entries(result.lhr.categories).map(([key, value]) => [
              key,
              Math.round(value.score * 100),
            ]),
          ),
          metrics: Object.fromEntries(
            [
              "largest-contentful-paint",
              "cumulative-layout-shift",
              "total-blocking-time",
            ].map((key) => [key, result.lhr.audits[key].numericValue]),
          ),
          version: result.lhr.lighthouseVersion,
          warnings: result.lhr.runWarnings,
        };
        runs.push(entry);
        console.log(JSON.stringify(entry));
      }
  const median = (values) => [...values].sort((a, b) => a - b)[1];
  const summary = [];
  for (const page of ["home", "detail"])
    for (const profile of ["mobile", "desktop"]) {
      const selected = runs.filter(
        (r) => r.page === page && r.profile === profile,
      );
      summary.push({
        page,
        profile,
        scores: Object.fromEntries(
          Object.keys(selected[0].scores).map((key) => [
            key,
            median(selected.map((r) => r.scores[key])),
          ]),
        ),
        metrics: Object.fromEntries(
          Object.keys(selected[0].metrics).map((key) => [
            key,
            median(selected.map((r) => r.metrics[key])),
          ]),
        ),
      });
    }
  fs.writeFileSync(
    "reports/lighthouse/summary.json",
    JSON.stringify(
      {
        environment: {
          node: process.version,
          platform: os.platform(),
          release: os.release(),
          cpu: os.cpus()[0]?.model,
          base,
          startedAt: new Date().toISOString(),
          scenario: "success",
          build: "dist; conteúdo integral e mocks habilitados",
          compression: "Brotli negociado pelo preview para JavaScript/CSS; demais recursos integrais",
        },
        runs,
        medians: summary,
      },
      null,
      2,
    ),
  );
  console.log("Medianas:", JSON.stringify(summary));
} finally {
  if (chrome) await chrome.kill();
  if (preview) preview.kill();
}
