import { tool } from "ai";
import { formatSpecIssues, validateSpec, type Spec } from "@json-render/core";
import { z } from "zod";
import { logArtifactTelemetry, summarizeSpec } from "../artifacts/artifact-telemetry";
import { normalizeJsonArtifactSpec } from "../artifacts/json-artifact-spec";
import { explorerCatalog } from "../render/catalog";

const catalogComponentNames = explorerCatalog.componentNames as [string, ...string[]];
const componentCatalogHint = catalogComponentNames.join(", ");

const uiElementSchema = z.object({
  type: z.enum(catalogComponentNames).describe(`Component type from the json-render catalog. Allowed values: ${componentCatalogHint}.`),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z.array(z.string()).optional(),
  visible: z.unknown().optional(),
  on: z.record(z.string(), z.unknown()).optional(),
  repeat: z.object({ statePath: z.string(), key: z.string().optional() }).optional(),
  watch: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const specSchema = z.object({
  root: z.string().min(1).describe("Element key for the root node. This exact key must exist in elements."),
  elements: z.record(z.string(), uiElementSchema)
    .refine((elements) => Object.keys(elements).length > 0, "spec.elements must contain at least the root element; empty element maps are invalid.")
    .describe("Non-empty flat json-render element map keyed by element id. Must include the root key."),
  state: z.record(z.string(), z.unknown()).optional().describe("Initial state object used by $state bindings."),
}).superRefine((spec, ctx) => {
  if (!spec.elements[spec.root]) {
    ctx.addIssue({
      code: "custom",
      path: ["elements", spec.root],
      message: `spec.elements must include the root key "${spec.root}".`,
    });
    return;
  }

  const structural = validateSpec(spec as Spec);
  for (const issue of structural.issues.filter((entry) => entry.severity === "error")) {
    ctx.addIssue({
      code: "custom",
      path: issue.elementKey ? ["elements", issue.elementKey] : ["elements"],
      message: issue.message,
    });
  }

  const catalog = explorerCatalog.validate(spec);
  const catalogError = catalog.success ? undefined : catalog.error;
  if (catalogError) {
    for (const issue of catalogError.issues) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  }
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
    `Create or replace the live canvas artifact with a COMPLETE json-render flat spec. Use this whenever the user explicitly asks to create an artifact, canvas, dashboard, report, page, or workspace. The spec must be renderable on the first call: elements cannot be empty; spec.root must exist in spec.elements; child ids must exist; component types must be one of: ${componentCatalogHint}. Minimal valid example: { "title": "Hello", "spec": { "root": "main", "elements": { "main": { "type": "Card", "props": { "title": "Hello", "description": "A starter artifact." }, "children": ["body"] }, "body": { "type": "Text", "props": { "content": "Hello world" }, "children": [] } }, "state": {} } }. Never call this with { "elements": {} }.`,
  inputSchema: z.object({
    title: z.string().describe("Short human-readable title for the artifact."),
    spec: specSchema.describe("Complete json-render flat spec to render in the artifact canvas."),
  }),
  execute: async ({ title, spec }) => {
    const normalized = normalizeJsonArtifactSpec(spec, title);
    if (normalized.recovered) {
      logArtifactTelemetry({
        source: "server",
        event: "tool.createJsonArtifact.rejected_invalid_spec",
        title,
        reason: normalized.reason,
        ...summarizeSpec(normalized.spec),
        ok: false,
        error: `Invalid JSON-render artifact spec: ${normalized.reason ?? "invalid_spec"}`,
      });
      throw new Error(`Invalid JSON-render artifact spec: ${normalized.reason ?? "invalid_spec"}. createJsonArtifact requires a non-empty elements map containing spec.root.`);
    }

    const structural = validateSpec(normalized.spec);
    const catalog = explorerCatalog.validate(normalized.spec);
    const catalogError = catalog.success ? undefined : catalog.error;
    if (!structural.valid || catalogError) {
      const structuralMessage = structural.valid ? "" : formatSpecIssues(structural.issues);
      const catalogMessage = catalogError ? catalogError.issues.map((issue) => `${issue.path.join(".") || "spec"}: ${issue.message}`).join("; ") : "";
      const message = [structuralMessage, catalogMessage].filter(Boolean).join("; ") || "invalid_spec";
      logArtifactTelemetry({
        source: "server",
        event: "tool.createJsonArtifact.rejected_invalid_spec",
        title,
        reason: message,
        ...summarizeSpec(normalized.spec),
        ok: false,
        error: message,
      });
      throw new Error(`Invalid JSON-render artifact spec: ${message}`);
    }

    logArtifactTelemetry({
      source: "server",
      event: "tool.createJsonArtifact",
      title,
      ...summarizeSpec(normalized.spec),
      ok: true,
    });

    return {
      kind: "json-render-artifact" as const,
      title,
      spec: normalized.spec,
      createdAt: new Date().toISOString(),
    };
  },
});
