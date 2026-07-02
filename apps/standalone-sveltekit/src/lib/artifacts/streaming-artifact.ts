import type { Spec } from "@json-render/core";
import { CREATE_JSON_ARTIFACT_TOOL_PART_TYPE, type JsonArtifactToolCandidate } from "./tool-artifact-extraction.ts";

/**
 * Live tool-input streaming for the JSON-render canvas.
 *
 * The AI SDK ("ai" v6) already owns the transport this needs: it emits
 * `tool-input-start` / `tool-input-delta` / `tool-input-available` chunks, and
 * `processUIMessageStream` (used by `@ai-sdk/svelte`'s Chat) accumulates the
 * `inputTextDelta`s by `toolCallId` and runs its own `parsePartialJson` over the
 * growing buffer. The result surfaces on the tool part as
 * `{ state: "input-streaming", input: DeepPartial<input> }`. So the accumulation
 * + partial-json parse the donor's `tool_input_delta` describes is provided for
 * free — we consume the SDK's parsed partial rather than re-teeing raw deltas.
 *
 * This reads the partial `spec` off a still-streaming `createJsonArtifact` tool
 * call and guards it down to a *minimally renderable* spec so the canvas can
 * mount progressively while the arguments are still arriving. Once the tool
 * reaches `output-available`, the completed spec (see
 * `findJsonArtifactToolCandidate`) is authoritative; both candidates share one
 * stable artifact id, so the partial -> final transition is an in-place version
 * bump — no second artifact, no tear.
 *
 * This is purely additive: it reads the SDK's already-parsed partial input and
 * never touches the completed-tool-call path. When no tool-input deltas arrive
 * (a provider that does not stream tool args), there is no `input-streaming`
 * part, this returns null, and the existing completed-output rendering runs
 * exactly as before. A structurally incomplete partial simply yields null (keep
 * last good) — an incomplete object never throws into the render tree.
 */

interface StreamingToolPartLike {
  type?: unknown;
  toolCallId?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
}

// States where the tool call is still emitting its input and no output exists
// yet. `output-available` / `output-error` are handled by the completed-output
// lane, so we deliberately stop previewing once the call resolves.
const STREAMING_INPUT_STATES = new Set(["input-streaming", "input-available"]);

/**
 * Returns a renderable partial-spec candidate for the newest still-streaming
 * `createJsonArtifact` tool call in `parts`, or null when none has enough
 * structure to render yet. The id matches `findJsonArtifactToolCandidate` so the
 * completed output promotes the same artifact.
 */
export function findStreamingJsonArtifactSpecCandidate(
  messageId: string,
  parts: readonly unknown[],
): JsonArtifactToolCandidate | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] as StreamingToolPartLike;
    if (!part || part.type !== CREATE_JSON_ARTIFACT_TOOL_PART_TYPE) continue;
    if (typeof part.state !== "string" || !STREAMING_INPUT_STATES.has(part.state)) continue;
    // Output already present: the completed-output lane owns this call.
    if (part.output !== undefined && part.output !== null) continue;

    const partial = isRecord(part.input) ? part.input : null;
    const spec = extractRenderablePartialSpec(partial);
    if (!spec) continue;

    const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : `part-${index}`;
    const title = partial && typeof partial.title === "string" ? partial.title : undefined;
    return {
      id: `json-render-tool:${messageId}:${toolCallId}`,
      spec,
      ...(title ? { title } : {}),
    };
  }

  return null;
}

/**
 * Guards a partial `spec` down to the minimum the core Renderer needs: a root
 * key, an elements map, and a root element with a type and props. The Renderer
 * only mounts `spec.elements[spec.root]` and skips children whose ids are not
 * present yet, so this is exactly the threshold at which progressive mounting is
 * safe. Incomplete deltas below this threshold return null (keep last good).
 */
export function extractRenderablePartialSpec(input: Record<string, unknown> | null): Spec | null {
  if (!input) return null;
  const spec = input.spec;
  return isMinimallyRenderableSpec(spec) ? spec : null;
}

export function isMinimallyRenderableSpec(value: unknown): value is Spec {
  if (!isRecord(value)) return false;
  if (typeof value.root !== "string" || !value.root) return false;
  if (!isRecord(value.elements)) return false;
  const rootElement = value.elements[value.root];
  if (!isRecord(rootElement)) return false;
  return typeof rootElement.type === "string" && isRecord(rootElement.props);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
