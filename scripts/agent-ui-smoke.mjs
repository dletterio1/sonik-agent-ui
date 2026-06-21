#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.env.AGENT_UI_SMOKE_RUN_ID ?? `agent-ui-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const baseUrl = process.env.AGENT_UI_BASE_URL ?? "http://localhost:5173";
const evidencePath = path.join(repoRoot, ".omx", "logs", `${runId}.json`);
const prompt = process.env.AGENT_UI_SMOKE_PROMPT ?? "In exactly three bullets, tell me what you can help with.";

const evidence = {
  schemaVersion: "sonik.agent_ui.smoke.v1",
  runId,
  baseUrl,
  promptClass: "three-bullet-stream-crash-regression",
  startedAt: new Date().toISOString(),
  status: "INCONCLUSIVE",
  events: [],
  errors: [],
  headers: [],
  pageContext: null,
  sessions: null,
};

function record(event, payload = {}) {
  evidence.events.push({ at: new Date().toISOString(), event, ...payload });
}

async function finish(status, reason) {
  evidence.status = status;
  evidence.reason = reason;
  evidence.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status, reason, evidencePath }, null, 2));
  process.exit(status === "FAIL" ? 1 : 0);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  await finish("INCONCLUSIVE", "Playwright is not installed in this workspace. Install it or run through the MCP/browser test lane to execute the browser smoke.");
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const page = await browser.newPage();
page.on("console", (message) => record("browser.console", { type: message.type(), text: message.text().slice(0, 2000) }));
page.on("pageerror", (error) => evidence.errors.push({ event: "pageerror", message: error.message, stack: error.stack }));
page.on("requestfailed", (request) => record("request.failed", { url: request.url(), failure: request.failure()?.errorText }));
page.on("response", async (response) => {
  if (!response.url().startsWith(baseUrl)) return;
  const headers = response.headers();
  if (headers["x-sonik-request-id"] || headers["x-sonik-trace-id"] || headers.traceparent) {
    evidence.headers.push({ url: response.url(), status: response.status(), requestId: headers["x-sonik-request-id"], traceId: headers["x-sonik-trace-id"], traceparent: headers.traceparent });
  }
});
page.on("crash", () => evidence.errors.push({ event: "page.crash", message: "Browser page crashed" }));

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator("textarea").first().fill(prompt);
  await page.getByRole("button", { name: /send/i }).last().click();
  await page.waitForTimeout(Number(process.env.AGENT_UI_SMOKE_WAIT_MS ?? 15_000));
  evidence.pageContext = await page.evaluate(() => window.__SONIK_AGENT_UI_PAGE_CONTEXT__?.() ?? null).catch((error) => ({ error: error.message }));
  evidence.sessions = await page.request.get(`${baseUrl}/api/sessions`).then((res) => res.json()).catch((error) => ({ error: error.message }));
  await browser.close();
  if (evidence.errors.some((error) => error.event === "page.crash" || error.event === "pageerror")) await finish("FAIL", "Browser crash/pageerror observed during streaming prompt.");
  if (!Array.isArray(evidence.sessions) || evidence.sessions.length === 0) await finish("FAIL", "No sessions returned after smoke prompt.");
  if (evidence.headers.length === 0) await finish("FAIL", "No generate correlation headers observed.");
  await finish("PASS", "Three-bullet streaming smoke completed without page crash and with correlated responses.");
} catch (error) {
  await browser.close().catch(() => undefined);
  evidence.errors.push({ event: "harness.error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  await finish("FAIL", "Smoke harness failed before completing browser assertions.");
}
