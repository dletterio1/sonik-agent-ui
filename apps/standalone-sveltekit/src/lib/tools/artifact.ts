import { tool } from "ai";
import type { Spec } from "@json-render/core";
import { z } from "zod";
import { logArtifactTelemetry, summarizeSpec } from "../artifacts/artifact-telemetry";

const uiElementSchema = z.object({
  type: z.string().describe("Component type from the json-render catalog, e.g. Card, Stack, Text, Metric, Table."),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z.array(z.string()).optional(),
  visible: z.unknown().optional(),
  on: z.record(z.string(), z.unknown()).optional(),
  repeat: z.object({ statePath: z.string(), key: z.string().optional() }).optional(),
  watch: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const specSchema = z.object({
  root: z.string().describe("Element key for the root node."),
  elements: z.record(z.string(), uiElementSchema).describe("Flat json-render element map keyed by element id. Must include the root key."),
  state: z.record(z.string(), z.unknown()).optional().describe("Initial state object used by $state bindings."),
}).refine((spec) => spec.root in spec.elements, {
  message: "spec.elements must include the root element key",
  path: ["elements"],
});

/**
 * Agent-facing canvas creation seam.
 *
 * This intentionally does not persist to disk/database yet. It creates a typed
 * tool-result envelope that the Svelte workspace promotes into the live
 * artifact pane. Long-term persistence belongs behind the artifact warehouse.
 */
export const createJsonArtifact = tool({
  description:
    "Create or replace the live canvas artifact with a json-render flat spec. Use this whenever the user explicitly asks to create an artifact, canvas, dashboard, report, page, document, or workspace.",
  inputSchema: z.object({
    title: z.string().describe("Short human-readable title for the artifact."),
    spec: specSchema.describe("Complete json-render flat spec to render in the artifact canvas."),
  }),
  execute: async ({ title, spec }) => {
    const typedSpec = spec as Spec;
    logArtifactTelemetry({
      source: "server",
      event: "tool.createJsonArtifact",
      title,
      ...summarizeSpec(typedSpec),
      ok: true,
    });

    return {
      kind: "json-render-artifact" as const,
      title,
      spec: typedSpec,
      createdAt: new Date().toISOString(),
    };
  },
});
