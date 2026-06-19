import { json } from "@sveltejs/kit";
import { writeAgentTelemetry, type AgentTelemetryEvent } from "$lib/server/agent-telemetry";

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events : body?.event ? [body.event] : [];
  const accepted: AgentTelemetryEvent[] = [];

  for (const event of events) {
    if (!isTelemetryEvent(event)) continue;
    accepted.push(event);
  }

  await Promise.all(accepted.map((event) => writeAgentTelemetry(event)));
  return json({ ok: true, accepted: accepted.length });
}

function isTelemetryEvent(value: unknown): value is AgentTelemetryEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.source === "server" || record.source === "client" || record.source === "odysseus-host") && typeof record.event === "string";
}
