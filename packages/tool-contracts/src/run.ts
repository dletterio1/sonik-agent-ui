// Run lifecycle contract for the Sonik Agent UI streaming endpoint.
//
// A "run" is one agent turn treated as a persisted, resumable object: it has a
// status, correlation ids, a per-run event log mirroring the UI-message stream,
// and — on transient failures — a `resumable` flag that drives a Continue
// affordance distinct from retry-from-scratch. Modelled on Open Design's
// `ChatRunStatusResponse` / `PersistedAgentEvent` (packages/contracts), reshaped
// for Sonik's persistence and json-render stream. Kept dependency-light (no AI
// SDK / observability imports) so both the producer (api/generate) and the
// consumers (persistence adapter, chat UI) share one type and cannot drift.

export const RUN_STATUSES = ["running", "succeeded", "failed", "canceled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return status !== "running";
}

// Structured failure codes surfaced on `error` status events so the UI can
// render error-specific affordances instead of a dead chat. `UNKNOWN` is the
// catch-all for opaque runtime failures (mirrors Open Design's
// classify-opaque-runtime-failure work).
export const RUN_ERROR_CODES = [
  "MISSING_HOST_CONTEXT",
  "RATE_LIMITED",
  "STALE_DEPLOYMENT",
  "AGENT_STREAM_FAILED",
  "UNKNOWN",
] as const;
export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];

export function isRunErrorCode(value: unknown): value is RunErrorCode {
  return typeof value === "string" && (RUN_ERROR_CODES as readonly string[]).includes(value);
}

/** Correlation ids reused from the request's telemetry correlation. Structurally
 *  identical to `AgentTelemetryCorrelation` so callers can pass it straight
 *  through without a new cross-package dependency. */
export interface RunCorrelation {
  requestId: string;
  traceId: string;
  traceparent: string;
}

export interface RunRecord {
  id: string;
  session_id: string;
  /** The assistant message id this run produces, when the client supplied one. */
  message_id: string | null;
  status: RunStatus;
  /** True when a failed run can be recovered by continuing rather than only
   *  restarting from scratch. Absent/false on success and non-resumable
   *  failures. Mirrors Open Design's `ChatRunStatusResponse.resumable`. */
  resumable: boolean;
  error: string | null;
  error_code: RunErrorCode | null;
  request_id: string | null;
  trace_id: string | null;
  traceparent: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

// Persisted, mapped event union mirroring the live UI-message stream — NOT raw
// transport chunks. `daemonAgentPayloadToPersistedAgentEvent` in Open Design
// draws the same producer/persisted line; here the mapping lives in the app's
// run-event-log (it needs the AI SDK chunk types). Reattach replays these in
// `seq` order to rebuild the assistant message including tool/artifact parts.
export type PersistedRunEvent =
  | { kind: "status"; label: string; detail?: string; code?: RunErrorCode }
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolCallId: string; toolName?: string; output: unknown; isError: boolean }
  | { kind: "artifact"; spec: unknown; dataPart?: unknown }
  | { kind: "usage"; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { kind: "error"; message: string; code?: RunErrorCode };

export type PersistedRunEventKind = PersistedRunEvent["kind"];

export interface RunEventRecord {
  id: string;
  run_id: string;
  session_id: string | null;
  seq: number;
  event: PersistedRunEvent;
  created_at: string;
}

// Canonical prompt sent by the "Continue" affordance on a resumable failed run.
// Adapted from Open Design's RESUME_CONTINUE_PROMPT: worded as a continuation of
// interrupted work, deliberately NOT a re-send of the original user turn (that
// is the from-scratch Retry path).
export const RESUME_CONTINUE_PROMPT =
  "The previous turn was interrupted before it finished. " +
  "If your last response was cut off, continue it from where you left off and " +
  "keep any work already produced; otherwise complete the original request. " +
  "Review the current workspace document and artifact state before making " +
  "further changes.";

export interface RunErrorAffordance {
  code: RunErrorCode;
  /** Short user-facing headline. */
  title: string;
  /** One-line guidance describing the specific recovery path. */
  guidance: string;
  /** Label for the primary recovery action, when one applies. */
  actionLabel: string | null;
  /** Whether the failure is transient and the run should offer Continue. */
  resumable: boolean;
}

const RUN_ERROR_AFFORDANCES: Record<RunErrorCode, RunErrorAffordance> = {
  MISSING_HOST_CONTEXT: {
    code: "MISSING_HOST_CONTEXT",
    title: "Host connection lost",
    guidance: "The signed host session expired or was not attached. Reconnect the host context, then continue the run.",
    actionLabel: "Reconnect and continue",
    resumable: true,
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    title: "Rate limit reached",
    guidance: "Requests are being throttled. Wait a moment, then continue the run.",
    actionLabel: "Continue",
    resumable: true,
  },
  STALE_DEPLOYMENT: {
    code: "STALE_DEPLOYMENT",
    title: "Deployment changed mid-run",
    guidance: "A new version deployed while this run was streaming. Continue to resume against the current deployment.",
    actionLabel: "Continue",
    resumable: true,
  },
  AGENT_STREAM_FAILED: {
    code: "AGENT_STREAM_FAILED",
    title: "Run interrupted",
    guidance: "The stream dropped before the turn finished. Continue to pick up where it left off.",
    actionLabel: "Continue",
    resumable: true,
  },
  UNKNOWN: {
    code: "UNKNOWN",
    title: "Run failed",
    guidance: "The run stopped for an unexpected reason. Retry to start the turn again.",
    actionLabel: null,
    resumable: false,
  },
};

export function describeRunError(code: RunErrorCode | null | undefined): RunErrorAffordance {
  if (code && isRunErrorCode(code)) return RUN_ERROR_AFFORDANCES[code];
  return RUN_ERROR_AFFORDANCES.UNKNOWN;
}

export function isResumableErrorCode(code: RunErrorCode | null | undefined): boolean {
  return describeRunError(code).resumable;
}

// Best-effort mapping from a raw failure (error message / HTTP status) to a
// structured code. Server-side classification; deliberately conservative so an
// unrecognised failure falls through to UNKNOWN rather than mislabelling.
export function classifyRunErrorCode(input: {
  message?: string | null;
  status?: number | null;
  cause?: string | null;
} = {}): RunErrorCode {
  const status = input.status ?? null;
  if (status === 429) return "RATE_LIMITED";
  const haystack = `${input.message ?? ""} ${input.cause ?? ""}`.toLowerCase();
  if (!haystack.trim()) return "UNKNOWN";
  if (haystack.includes("missing-host-context") || haystack.includes("host context") || haystack.includes("host session")) {
    return "MISSING_HOST_CONTEXT";
  }
  if (haystack.includes("rate limit") || haystack.includes("rate-limit") || haystack.includes("too many requests") || haystack.includes("429")) {
    return "RATE_LIMITED";
  }
  if (haystack.includes("stale") || haystack.includes("deployment") || haystack.includes("worker was updated") || haystack.includes("script updated")) {
    return "STALE_DEPLOYMENT";
  }
  return "UNKNOWN";
}
