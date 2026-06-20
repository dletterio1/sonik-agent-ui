import { createAgent } from "$lib/agent";
import { minuteRateLimit, dailyRateLimit } from "$lib/rate-limit";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { pipeArtifactToolOutputsToSpecParts } from "$lib/artifacts/artifact-stream";
import { logArtifactTelemetry } from "$lib/artifacts/artifact-telemetry";
import { writeAgentTelemetry } from "$lib/server/agent-telemetry";
import { instrumentGenerateStream } from "$lib/server/stream-telemetry";
import { summarizeWorkspaceContext, syncActiveWorkspaceDocumentSnapshot, type WorkspaceDocumentRecord } from "$lib/server/workspace-store";
import { createStandaloneCommandIndexSummary } from "$lib/server/tool-manifest";
import {
  routeString,
  WORKSPACE_CONTENT_MAX_CHARS,
  WORKSPACE_LANGUAGE_MAX_CHARS,
  WORKSPACE_SESSION_ID_MAX_CHARS,
  WORKSPACE_TITLE_MAX_CHARS,
} from "$lib/server/workspace-route-limits";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

  const [minuteResult, dailyResult] = await Promise.all([
    minuteRateLimit.limit(ip),
    dailyRateLimit.limit(ip),
  ]);

  if (!minuteResult.success || !dailyResult.success) {
    const isMinuteLimit = !minuteResult.success;
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        message: isMinuteLimit
          ? "Too many requests. Please wait a moment before trying again."
          : "Daily limit reached. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await request.json();
  const uiMessages: UIMessage[] = body.messages;
  const activeDocument = _resolveActiveDocument(body?.workspace?.activeDocument);
  const requestId = crypto.randomUUID();
  const workspaceSessionId = routeString(body?.workspace?.sessionId, "workspace.sessionId", WORKSPACE_SESSION_ID_MAX_CHARS, "") || undefined;
  const telemetrySessionId = activeDocument?.session_id ?? workspaceSessionId;
  const startedAt = Date.now();

  if (!uiMessages || !Array.isArray(uiMessages) || uiMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const lastMessage = uiMessages.at(-1);
  const startEvent = {
    source: "server" as const,
    event: "api.generate.start",
    requestId,
    sessionId: telemetrySessionId,
    messageId: lastMessage?.id,
    documentId: activeDocument?.id,
    documentVersion: activeDocument?.version_count,
    title: activeDocument?.title,
    ok: true,
  };
  logArtifactTelemetry(startEvent);
  void writeAgentTelemetry(startEvent).catch(() => undefined);

  const modelMessages = await convertToModelMessages(uiMessages);
  const contextSummary = summarizeWorkspaceContext({ activeDocument });
  const commandIndexSummary = createStandaloneCommandIndexSummary({ includeApprovalRequired: true });
  const systemContext = [contextSummary, `CONTRACT-DERIVED COMMAND STARTUP INDEX:\n${commandIndexSummary}`].filter(Boolean).join("\n\n");
  const contextualModelMessages = systemContext
    ? [{ role: "system" as const, content: systemContext }, ...modelMessages]
    : modelMessages;
  void writeAgentTelemetry({
    source: "server",
    event: "api.generate.command_index_context",
    requestId,
    sessionId: telemetrySessionId,
    messageId: lastMessage?.id,
    elementCount: commandIndexSummary.split("\n- ").length - 1,
    ok: true,
  }).catch(() => undefined);
  const agent = createAgent({ activeDocument, sessionId: telemetrySessionId });

  try {
    const result = await agent.stream({ messages: contextualModelMessages });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const aiStream = pipeArtifactToolOutputsToSpecParts(pipeJsonRender(result.toUIMessageStream()));
        writer.merge(instrumentGenerateStream(aiStream, {
          requestId,
          sessionId: telemetrySessionId,
          messageId: lastMessage?.id,
          documentId: activeDocument?.id,
          documentVersion: activeDocument?.version_count,
          startedAt,
        }));
        void writeAgentTelemetry({
          source: "server",
          event: "api.generate.stream_attached",
          requestId,
          sessionId: telemetrySessionId,
          messageId: lastMessage?.id,
          documentId: activeDocument?.id,
          documentVersion: activeDocument?.version_count,
          durationMs: Date.now() - startedAt,
          ok: true,
        }).catch(() => undefined);
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        void writeAgentTelemetry({
          source: "server",
          event: "api.generate.stream_error",
          requestId,
          sessionId: telemetrySessionId,
          messageId: lastMessage?.id,
          durationMs: Date.now() - startedAt,
          ok: false,
          error: message,
        }).catch(() => undefined);
        return message;
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void writeAgentTelemetry({
      source: "server",
      event: "api.generate.error",
      requestId,
      sessionId: telemetrySessionId,
      messageId: lastMessage?.id,
      durationMs: Date.now() - startedAt,
      ok: false,
      error: message,
    }).catch(() => undefined);
    throw error;
  }
};


export function _resolveActiveDocument(value: unknown): WorkspaceDocumentRecord | null {
  if (!isRecord(value)) return null;
  const id = routeString(value.id, "workspace.activeDocument.id", WORKSPACE_SESSION_ID_MAX_CHARS, "");
  if (typeof value.title !== "string" || typeof value.current_content !== "string") return null;

  const snapshot: WorkspaceDocumentRecord = {
    id: id || "active-document",
    session_id: routeString(value.session_id, "workspace.activeDocument.session_id", WORKSPACE_SESSION_ID_MAX_CHARS, "") || null,
    title: routeString(value.title, "workspace.activeDocument.title", WORKSPACE_TITLE_MAX_CHARS),
    language: routeString(value.language, "workspace.activeDocument.language", WORKSPACE_LANGUAGE_MAX_CHARS, "markdown"),
    current_content: routeString(value.current_content, "workspace.activeDocument.current_content", WORKSPACE_CONTENT_MAX_CHARS),
    version_count: typeof value.version_count === "number" ? value.version_count : 1,
    is_active: true,
    archived: false,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  };

  return id ? syncActiveWorkspaceDocumentSnapshot(snapshot) : snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
