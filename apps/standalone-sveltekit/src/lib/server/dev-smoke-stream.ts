import { dev } from "$app/environment";
import { createUIMessageStream } from "ai";
import type { UIMessageChunk } from "ai";
import { pipeUiMessageStreamSafety } from "@json-render/core";
import { instrumentGenerateStream } from "$lib/server/stream-telemetry";
import { writeAgentTelemetry } from "$lib/server/agent-telemetry";

export const DEV_SMOKE_STREAM_HEADER = "x-sonik-agent-ui-smoke-stream";
export const DEV_SMOKE_RUN_ID_HEADER = "x-sonik-agent-ui-smoke-run-id";
export const DEV_SMOKE_FAIL_HEADER = "x-sonik-agent-ui-smoke-fail";

export interface DevSmokeStreamInput {
  requestId: string;
  traceId: string;
  traceparent: string;
  sessionId?: string;
  messageId?: string;
  runId?: string;
  startedAt: number;
  /** Dev-only: emit one delta then error the stream, to exercise run failure + reattach. */
  failMode?: boolean;
}

export function readDevSmokeRunId(request: Request): string | undefined {
  const value = request.headers.get(DEV_SMOKE_RUN_ID_HEADER);
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{6,160}$/.test(value) ? value : undefined;
}

export function readDevSmokeFailMode(request: Request): boolean {
  return dev && request.headers.get(DEV_SMOKE_FAIL_HEADER) === "true";
}

export function shouldUseDevSmokeStream(request: Request): boolean {
  return dev && request.headers.get(DEV_SMOKE_STREAM_HEADER) === "true";
}

export async function writeDevSmokeStreamTelemetry(input: DevSmokeStreamInput): Promise<void> {
  await writeAgentTelemetry({
    source: "server",
    event: "api.generate.dev_smoke_stream",
    requestId: input.requestId,
    traceId: input.traceId,
    traceparent: input.traceparent,
    sessionId: input.sessionId,
    messageId: input.messageId,
    runId: input.runId,
    ok: true,
  });
}

export function createDevSmokeStream(input: DevSmokeStreamInput): ReadableStream<UIMessageChunk> {
  if (input.failMode) return createDevSmokeFailStream(input);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "smoke-text";
      writer.write({ type: "text-start", id });
      for (const delta of [
        "- I can help create and update workspace artifacts.\n",
        "- I can render structured JSON UI and documents.\n",
        "- I can expose tool and session state for regression testing.",
      ]) {
        await sleep(75);
        writer.write({ type: "text-delta", id, delta });
      }
      writer.write({ type: "text-end", id });
    },
    onError: (error) => error instanceof Error ? error.message : String(error),
  });

  const safeStream = pipeUiMessageStreamSafety(stream, {
    onStats: (stats) => {
      void writeAgentTelemetry({
        source: "server",
        event: "api.generate.stream_safety",
        requestId: input.requestId,
        traceId: input.traceId,
        traceparent: input.traceparent,
        sessionId: input.sessionId,
        messageId: input.messageId,
        runId: input.runId,
        durationMs: Date.now() - input.startedAt,
        ok: true,
        reason: "stream_safety_filter_applied",
        payload: {
          textDeltaChunksIn: stats.textDeltaChunksIn,
          textDeltaChunksOut: stats.textDeltaChunksOut,
          textDeltaCharsOut: stats.textDeltaCharsOut,
        },
      }).catch(() => undefined);
    },
  });

  return instrumentGenerateStream(safeStream, {
    requestId: input.requestId,
    traceId: input.traceId,
    traceparent: input.traceparent,
    sessionId: input.sessionId,
    messageId: input.messageId,
    runId: input.runId,
    startedAt: input.startedAt,
  });
}

// Dev-only: stream one visible delta then error the stream, so teeRunEvents
// persists partial text + finalizes the run failed + resumable. Used by the
// run-reattach smoke to produce a deterministic interrupted run.
function createDevSmokeFailStream(input: DevSmokeStreamInput): ReadableStream<UIMessageChunk> {
  const id = "smoke-text";
  const raw = new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "text-start", id });
      controller.enqueue({ type: "text-delta", id, delta: "Partial answer before the stream was interrupted" });
      await sleep(25);
      controller.error(new Error("dev smoke injected stream failure"));
    },
  });
  return instrumentGenerateStream(raw, {
    requestId: input.requestId,
    traceId: input.traceId,
    traceparent: input.traceparent,
    sessionId: input.sessionId,
    messageId: input.messageId,
    runId: input.runId,
    startedAt: input.startedAt,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
