import { existsSync } from "node:fs";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export type AgentTelemetrySource = "server" | "client" | "odysseus-host";

export interface AgentTelemetryEvent {
  source: AgentTelemetrySource;
  event: string;
  requestId?: string;
  messageId?: string;
  toolCallId?: string;
  artifactId?: string;
  artifactVersion?: number;
  documentId?: string;
  documentVersion?: number;
  title?: string;
  root?: string;
  elementCount?: number;
  reason?: string;
  mode?: string;
  durationMs?: number;
  ok?: boolean;
  error?: string;
  at?: string;
}

const MAX_STRING_LENGTH = 2_000;

export async function writeAgentTelemetry(event: AgentTelemetryEvent): Promise<void> {
  const payload = sanitizeAgentTelemetry(event);
  const logPath = resolveTelemetryLogPath();
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export function sanitizeAgentTelemetry(event: AgentTelemetryEvent): AgentTelemetryEvent {
  const payload: AgentTelemetryEvent = {
    ...event,
    at: event.at ?? new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(payload) as Array<[keyof AgentTelemetryEvent, unknown]>) {
    if (value === undefined || value === "") delete payload[key];
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      payload[key] = `${value.slice(0, MAX_STRING_LENGTH)}…` as never;
    }
  }

  return payload;
}

function resolveTelemetryLogPath(): string {
  if (process.env.SONIK_AGENT_UI_TELEMETRY_LOG) return process.env.SONIK_AGENT_UI_TELEMETRY_LOG;
  return path.join(findRepoRoot(process.cwd()), ".omx", "logs", "agent-ui-telemetry.jsonl");
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let index = 0; index < 8; index += 1) {
    if (existsSync(path.join(current, ".omx")) || existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}
