import { z } from "zod";

export const toolSourceSchema = z.enum(["orpc", "openapi", "mcp", "sandbox", "local-ui"]);
export const toolEffectSchema = z.enum(["read", "write", "destructive", "environment", "unknown"]);
export const toolApprovalSchema = z.enum(["none", "required", "denied"]);
export const toolUiTargetSchema = z.enum(["none", "chat", "inline-json", "artifact", "canvas", "document", "terminal"]);

export type ToolSource = z.infer<typeof toolSourceSchema>;
export type ToolEffect = z.infer<typeof toolEffectSchema>;
export type ToolApproval = z.infer<typeof toolApprovalSchema>;
export type ToolUiTarget = z.infer<typeof toolUiTargetSchema>;

export const toolSchemaRefSchema = z.object({
  kind: z.enum(["zod", "json-schema", "openapi", "unknown"]),
  ref: z.string().optional(),
  schema: z.unknown().optional(),
});

export const toolContractEntrySchema = z.object({
  id: z.string().min(1),
  source: toolSourceSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  effect: toolEffectSchema,
  approval: toolApprovalSchema.default("none"),
  uiTargets: z.array(toolUiTargetSchema).default(["chat"]),
  capabilities: z.array(z.string()).default([]),
  input: toolSchemaRefSchema.default({ kind: "unknown" }),
  output: toolSchemaRefSchema.default({ kind: "unknown" }),
  auth: z.object({
    required: z.boolean().default(false),
    scopes: z.array(z.string()).default([]),
    orgScoped: z.boolean().default(false),
  }).default({ required: false, scopes: [], orgScoped: false }),
  transport: z.object({
    procedure: z.string().optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    runtimeStatus: z.enum(["mounted", "shadow", "unknown"]).default("unknown"),
  }).default({ runtimeStatus: "unknown" }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const toolManifestSchema = z.object({
  version: z.literal("sonik-agent-ui.tool-manifest.v1"),
  generatedAt: z.string(),
  provider: z.string().min(1),
  tools: z.array(toolContractEntrySchema),
});

export type ToolSchemaRef = z.infer<typeof toolSchemaRefSchema>;
export type ToolContractEntry = z.infer<typeof toolContractEntrySchema>;
export type ToolManifest = z.infer<typeof toolManifestSchema>;

export type ToolAvailabilityContext = {
  authenticated?: boolean;
  organizationId?: string | null;
  scopes?: string[];
  allowMutations?: boolean;
  allowDestructive?: boolean;
  includeApprovalRequired?: boolean;
  sourceMode?: "all" | "orpc-app-state" | "mcp" | "sandbox" | "local-ui";
};

export type ToolPolicyDecision = {
  decision: "allow" | "approval_required" | "deny";
  reasons: string[];
};

const mutationVerbPattern = /(^|\.)(create|update|patch|delete|remove|cancel|confirm|assign|unassign|reserve|commit|send|upload|open|add|post)(\.|$)/i;
const destructiveVerbPattern = /(^|\.)(delete|remove|destroy|purge|void|revoke|unassign)(\.|$)/i;
const arbitraryEndpointPattern = /(^https?:\/\/)|[\s]|\//i;
const validProcedurePattern = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/i;

export function createToolManifest(provider: string, tools: ToolContractEntry[], generatedAt = new Date().toISOString()): ToolManifest {
  return toolManifestSchema.parse({ version: "sonik-agent-ui.tool-manifest.v1", generatedAt, provider, tools });
}

export function inferEffectFromHttpMethod(method?: string): ToolEffect {
  const normalized = method?.toUpperCase();
  if (!normalized) return "unknown";
  if (["GET", "HEAD", "OPTIONS"].includes(normalized)) return "read";
  if (["POST", "PUT", "PATCH"].includes(normalized)) return "write";
  if (normalized === "DELETE") return "destructive";
  return "unknown";
}

export function inferEffectFromProcedureId(id: string, defaultEffect: ToolEffect = "unknown"): ToolEffect {
  if (destructiveVerbPattern.test(id)) return "destructive";
  if (mutationVerbPattern.test(id)) return "write";
  if (/(^|\.)(get|list|read|search|lookup|preview|learn|catalog|find)(\.|$)/i.test(id)) return "read";
  return defaultEffect;
}

export function isValidOrpcProcedureId(id: string): boolean {
  if (arbitraryEndpointPattern.test(id)) return false;
  return validProcedurePattern.test(id);
}

export function normalizeToolEntry(entry: ToolContractEntry): ToolContractEntry {
  const parsed = toolContractEntrySchema.parse(entry);
  const inferredEffect = parsed.effect === "unknown" ? inferEffectFromProcedureId(parsed.id, parsed.effect) : parsed.effect;
  return {
    ...parsed,
    effect: inferredEffect,
    approval: normalizeApproval(parsed.approval, inferredEffect),
  };
}

export function evaluateToolPolicy(tool: ToolContractEntry, context: ToolAvailabilityContext = {}): ToolPolicyDecision {
  const entry = normalizeToolEntry(tool);
  const reasons: string[] = [];

  if (context.sourceMode === "orpc-app-state" && entry.source !== "orpc" && entry.source !== "openapi") {
    return { decision: "deny", reasons: ["source_not_orpc_app_state"] };
  }
  if (context.sourceMode === "mcp" && entry.source !== "mcp") {
    return { decision: "deny", reasons: ["source_not_mcp"] };
  }
  if (context.sourceMode === "sandbox" && entry.source !== "sandbox") {
    return { decision: "deny", reasons: ["source_not_sandbox"] };
  }
  if (context.sourceMode === "local-ui" && entry.source !== "local-ui") {
    return { decision: "deny", reasons: ["source_not_local_ui"] };
  }

  if (entry.source === "orpc" && !isValidOrpcProcedureId(entry.transport.procedure ?? entry.id)) {
    reasons.push("invalid_orpc_procedure_id");
  }
  if (entry.source === "sandbox" && context.sourceMode === "orpc-app-state") {
    reasons.push("sandbox_not_app_state");
  }
  if (entry.auth.required && context.authenticated !== true) {
    reasons.push("auth_required");
  }
  if (entry.auth.orgScoped && !context.organizationId) {
    reasons.push("organization_required");
  }
  const contextScopes = new Set(context.scopes ?? []);
  const missingScopes = entry.auth.scopes.filter((scope) => !contextScopes.has(scope));
  if (missingScopes.length > 0) {
    reasons.push(`missing_scopes:${missingScopes.join(",")}`);
  }
  if (entry.approval === "denied") {
    reasons.push("tool_denied_by_manifest");
  }
  if (entry.effect === "unknown") {
    reasons.push("unknown_effect_denied");
  }
  if (entry.effect === "environment" && entry.source !== "sandbox") {
    reasons.push("environment_effect_requires_sandbox_source");
  }
  if (entry.effect === "write" && context.allowMutations !== true && entry.approval !== "required") {
    reasons.push("write_requires_approval_or_mutation_context");
  }
  if (entry.effect === "destructive" && context.allowDestructive !== true) {
    reasons.push("destructive_requires_explicit_approval");
  }

  if (reasons.length > 0) {
    const approvalGateOnly = reasons.every((reason) =>
      ["write_requires_approval_or_mutation_context", "destructive_requires_explicit_approval"].includes(reason)
    ) && entry.approval === "required";
    return approvalGateOnly ? { decision: "approval_required", reasons } : { decision: "deny", reasons };
  }

  if (entry.approval === "required") {
    return { decision: "approval_required", reasons: ["manifest_requires_approval"] };
  }

  return { decision: "allow", reasons: ["policy_allowed"] };
}

export function filterAvailableTools(manifest: ToolManifest, context: ToolAvailabilityContext = {}): ToolManifest {
  const tools = manifest.tools
    .map(normalizeToolEntry)
    .map((tool) => ({ tool, policy: evaluateToolPolicy(tool, context) }))
    .filter(({ policy }) => policy.decision === "allow" || (context.includeApprovalRequired === true && policy.decision === "approval_required"))
    .map(({ tool, policy }) => ({
      ...tool,
      approval: policy.decision === "approval_required" ? "required" : tool.approval,
      metadata: { ...tool.metadata, policyDecision: policy.decision, policyReasons: policy.reasons },
    }));

  return createToolManifest(manifest.provider, tools, manifest.generatedAt);
}

export function summarizeToolManifest(manifest: ToolManifest): string {
  const bySource = countBy(manifest.tools.map((tool) => tool.source));
  const byEffect = countBy(manifest.tools.map((tool) => tool.effect));
  const lines = [
    `Tool manifest ${manifest.provider}: ${manifest.tools.length} tools`,
    `sources=${formatCounts(bySource)}`,
    `effects=${formatCounts(byEffect)}`,
  ];
  for (const tool of manifest.tools.slice(0, 20)) {
    lines.push(`- ${tool.id} [${tool.source}/${tool.effect}/${tool.approval}] targets=${tool.uiTargets.join(",")}: ${tool.title}`);
  }
  if (manifest.tools.length > 20) lines.push(`- ...${manifest.tools.length - 20} more`);
  return lines.join("\n");
}

function normalizeApproval(approval: ToolApproval, effect: ToolEffect): ToolApproval {
  if (approval !== "none") return approval;
  if (effect === "write" || effect === "destructive" || effect === "environment") return "required";
  if (effect === "unknown") return "denied";
  return "none";
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(",") || "none";
}

export const commandShapeSchema = z.enum(["dispatch", "record", "catalog", "media", "local-ui", "composite"]);
export const commandExecutionSourceSchema = z.enum(["cli", "mcp", "agent-ui", "orpc", "sandbox", "surface", "test", "headless"]);
export const commandActionSchema = z.enum(["execute", "commit"]);
export const commandPolicyDecisionSchema = z.object({
  decision: z.enum(["allow", "deny", "needs_approval", "approval_required"]),
  reasons: z.array(z.string()),
});

export const commandReceiptSchema = z.object({
  ok: z.boolean(),
  commandId: z.string().min(1),
  summary: z.unknown(),
  handle: z.string().optional(),
  resources: z.array(z.object({ uri: z.string(), title: z.string(), mimeType: z.string().optional() })).optional(),
  nextActions: z.array(z.string()).default([]),
  policy: commandPolicyDecisionSchema,
  trace: z.object({
    requestId: z.string().min(1),
    sessionId: z.string().nullable().optional(),
    durationMs: z.number().nonnegative(),
    provider: z.string().optional(),
    cache: z.enum(["hit", "miss"]).optional(),
    source: commandExecutionSourceSchema,
  }),
  errors: z.array(z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() })).optional(),
}).superRefine((receipt, ctx) => {
  if (receipt.resources && receipt.resources.length > 0 && !receipt.handle) {
    ctx.addIssue({ code: "custom", path: ["handle"], message: "Command receipts that return resources must include a stable handle." });
  }
});

export const commandDescriptorSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  source: toolSourceSchema,
  effect: toolEffectSchema,
  approval: toolApprovalSchema,
  shape: commandShapeSchema.default("composite"),
  capabilities: z.array(z.string()).default([]),
  searchTerms: z.array(z.string()).default([]),
  examples: z.array(z.object({ title: z.string(), input: z.unknown() })).default([]),
  input: toolSchemaRefSchema.default({ kind: "unknown" }),
  inputSchemaJson: z.record(z.string(), z.unknown()).optional(),
  output: z.object({
    summary: z.string(),
    schema: toolSchemaRefSchema.optional(),
    handle: z.string().optional(),
    resources: z.array(z.string()).default([]),
  }),
  auth: z.object({
    required: z.boolean().default(false),
    scopes: z.array(z.string()).default([]),
    orgScoped: z.boolean().default(false),
  }).default({ required: false, scopes: [], orgScoped: false }),
  policy: z.object({
    tags: z.array(z.string()).default([]),
    hostProfiles: z.array(z.string()).default(["local"]),
    readOnly: z.boolean(),
    proofTier: z.string().optional(),
  }),
  transport: z.object({
    procedure: z.string().optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    runtimeStatus: z.enum(["mounted", "shadow", "unknown"]).default("unknown"),
  }).default({ runtimeStatus: "unknown" }),
  surfaces: z.array(z.string()).default([]),
  uiTargets: z.array(toolUiTargetSchema).default(["chat"]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const commandCatalogSchema = z.object({
  version: z.literal("sonik-agent-ui.command-catalog.v1"),
  generatedAt: z.string(),
  provider: z.string().min(1),
  commands: z.array(commandDescriptorSchema),
});

export type CommandShape = z.infer<typeof commandShapeSchema>;
export type CommandExecutionSource = z.infer<typeof commandExecutionSourceSchema>;
export type CommandAction = z.infer<typeof commandActionSchema>;
export type CommandPolicyDecision = z.infer<typeof commandPolicyDecisionSchema>;
export type CommandReceipt = z.infer<typeof commandReceiptSchema>;
export type CommandDescriptor = z.infer<typeof commandDescriptorSchema>;
export type CommandCatalog = z.infer<typeof commandCatalogSchema>;

export type CommandExecutionContext = {
  action?: CommandAction;
  source?: CommandExecutionSource;
  requestId?: string;
  sessionId?: string | null;
  approved?: boolean;
  allowSandbox?: boolean;
  authenticated?: boolean;
  organizationId?: string | null;
  scopes?: string[];
};

export type CommandLearnAspect = "description" | "schema" | "examples" | "policy" | "output" | "surfaces" | "transport" | "auth";
export type CommandCatalogSearchResult = {
  commands: Array<Pick<CommandDescriptor, "id" | "title" | "description" | "capabilities" | "source" | "effect" | "approval" | "surfaces" | "uiTargets">>;
  totalMatches: number;
  truncated: boolean;
  limit: number;
};

export function createCommandCatalog(provider: string, commands: CommandDescriptor[], generatedAt = new Date().toISOString()): CommandCatalog {
  return commandCatalogSchema.parse({ version: "sonik-agent-ui.command-catalog.v1", generatedAt, provider, commands });
}

export function createCommandCatalogFromToolManifest(manifest: ToolManifest): CommandCatalog {
  return createCommandCatalog(manifest.provider, manifest.tools.map(commandDescriptorFromToolEntry), manifest.generatedAt);
}

export function commandDescriptorFromToolEntry(entry: ToolContractEntry): CommandDescriptor {
  const tool = normalizeToolEntry(entry);
  const examples = Array.isArray(tool.metadata.examples) ? tool.metadata.examples : [];
  const outputResources = Array.isArray(tool.metadata.resources) ? tool.metadata.resources.filter((value): value is string => typeof value === "string") : [];
  return commandDescriptorSchema.parse({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    source: tool.source,
    effect: tool.effect,
    approval: tool.approval,
    shape: inferCommandShape(tool),
    capabilities: tool.capabilities,
    searchTerms: [...new Set([tool.id, tool.title, tool.description, ...tool.capabilities].flatMap(tokenizeCommandText))],
    examples,
    input: tool.input,
    inputSchemaJson: schemaJsonFromRef(tool.input),
    output: {
      summary: tool.description || tool.title,
      schema: tool.output,
      resources: outputResources,
    },
    auth: tool.auth,
    policy: {
      tags: [tool.source, tool.effect, tool.approval, tool.transport.runtimeStatus, ...tool.capabilities].filter(Boolean),
      hostProfiles: ["local", "agent-ui"],
      readOnly: tool.effect === "read",
      proofTier: typeof tool.metadata.proofTier === "string" ? tool.metadata.proofTier : undefined,
    },
    transport: tool.transport,
    surfaces: tool.uiTargets.filter((target) => target !== "none"),
    uiTargets: tool.uiTargets,
    metadata: tool.metadata,
  });
}

export function projectCommandToToolEntry(command: CommandDescriptor): ToolContractEntry {
  return normalizeToolEntry({
    id: command.id,
    source: command.source,
    title: command.title,
    description: command.description,
    effect: command.effect,
    approval: command.approval,
    uiTargets: command.uiTargets,
    capabilities: command.capabilities,
    input: command.input,
    output: command.output.schema ?? { kind: "unknown" },
    auth: command.auth,
    transport: command.transport,
    metadata: {
      ...command.metadata,
      commandShape: command.shape,
      commandSurfaces: command.surfaces,
      commandPolicy: command.policy,
    },
  });
}

export function searchCommandCatalog(catalog: CommandCatalog, query = "", limit = 20): CommandCatalogSearchResult["commands"] {
  return searchCommandCatalogWithMetadata(catalog, query, limit).commands;
}

export function searchCommandCatalogWithMetadata(catalog: CommandCatalog, query = "", limit = 20): CommandCatalogSearchResult {
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const normalized = query.trim().toLowerCase();
  const tokens = tokenizeCommandText(normalized);
  const matches = catalog.commands
    .filter((command) => {
      if (tokens.length === 0) return true;
      const haystack = [command.id, command.title, command.description, ...command.capabilities, ...command.searchTerms, ...command.surfaces].join(" ").toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    commands: matches
      .slice(0, boundedLimit)
      .map(({ id, title, description, capabilities, source, effect, approval, surfaces, uiTargets }) => ({ id, title, description, capabilities, source, effect, approval, surfaces, uiTargets })),
    totalMatches: matches.length,
    truncated: matches.length > boundedLimit,
    limit: boundedLimit,
  };
}

export function learnCommandDescriptor(catalog: CommandCatalog, commandId: string, aspects: CommandLearnAspect[] = ["description", "schema", "examples", "policy", "output", "surfaces", "transport", "auth"]): Record<string, unknown> {
  const command = catalog.commands.find((entry) => entry.id === commandId);
  if (!command) return { ok: false, error: "UNKNOWN_COMMAND", commandId };
  const learned: Record<string, unknown> = { ok: true, commandId: command.id, title: command.title, source: command.source, effect: command.effect, approval: command.approval };
  if (aspects.includes("description")) learned.description = command.description;
  if (aspects.includes("schema")) learned.inputSchema = command.inputSchemaJson ?? command.input;
  if (aspects.includes("examples")) learned.examples = command.examples;
  if (aspects.includes("policy")) learned.policy = command.policy;
  if (aspects.includes("output")) learned.output = command.output;
  if (aspects.includes("surfaces")) learned.surfaces = command.surfaces;
  if (aspects.includes("transport")) learned.transport = command.transport;
  if (aspects.includes("auth")) learned.auth = command.auth;
  return learned;
}

export function evaluateCommandPolicy(command: CommandDescriptor, context: CommandExecutionContext = {}): CommandPolicyDecision {
  const action = context.action ?? "execute";
  const reasons: string[] = [];
  if (command.transport.runtimeStatus !== "mounted") reasons.push(`runtime_not_mounted:${command.transport.runtimeStatus}`);
  if ((command.source === "orpc" || command.source === "openapi") && command.metadata.liveExecution !== true) reasons.push("orpc_execution_adapter_not_mounted");
  if (command.source === "mcp") reasons.push("mcp_projection_not_native_execution");
  if (command.source === "sandbox" && context.allowSandbox !== true) reasons.push("sandbox_execution_not_enabled");
  if (command.auth.required && context.authenticated !== true) reasons.push("auth_required");
  if (command.auth.orgScoped && !context.organizationId) reasons.push("organization_required");
  const contextScopes = new Set(context.scopes ?? []);
  const missingScopes = command.auth.scopes.filter((scope) => !contextScopes.has(scope));
  if (missingScopes.length > 0) reasons.push(`missing_scopes:${missingScopes.join(",")}`);
  if (action === "execute" && !command.policy.readOnly) reasons.push("use_commit_for_mutation_command");
  if (action === "commit" && command.policy.readOnly) reasons.push("read_only_command_uses_execute");
  if (action === "commit" && command.approval === "required" && context.approved !== true) reasons.push("approval_required");
  if (command.approval === "denied") reasons.push("command_denied_by_manifest");
  if (command.effect === "destructive" && context.approved !== true) reasons.push("destructive_requires_explicit_approval");
  if (reasons.length === 0) return { decision: "allow", reasons: ["policy_allowed"] };
  if (reasons.every((reason) => reason === "approval_required" || reason === "use_commit_for_mutation_command")) return { decision: "needs_approval", reasons };
  if (reasons.length === 1 && reasons[0] === "approval_required") return { decision: "needs_approval", reasons };
  return { decision: "deny", reasons };
}

export function executeCatalogCommand(catalog: CommandCatalog, commandId: string, input: unknown = {}, context: CommandExecutionContext = {}): CommandReceipt {
  const startedAt = Date.now();
  const source = context.source ?? "agent-ui";
  const requestId = context.requestId ?? commandReceiptRequestId(commandId, startedAt);
  const command = catalog.commands.find((entry) => entry.id === commandId);
  if (!command) {
    return commandReceiptSchema.parse({
      ok: false,
      commandId,
      summary: { message: "Unknown command" },
      nextActions: ["searchCommandCatalog"],
      policy: { decision: "deny", reasons: ["unknown_command"] },
      trace: { requestId, sessionId: context.sessionId, durationMs: Date.now() - startedAt, source },
      errors: [{ code: "UNKNOWN_COMMAND", message: `No command registered for ${commandId}`, retryable: true }],
    });
  }
  const action = context.action ?? "execute";
  const policy = evaluateCommandPolicy(command, { ...context, action });
  const ok = policy.decision === "allow";
  return commandReceiptSchema.parse({
    ok,
    commandId,
    summary: ok
      ? {
          message: `${action === "commit" ? "Committed" : "Executed"} ${command.title}`,
          command: { id: command.id, source: command.source, effect: command.effect, shape: command.shape },
          input,
          dryRun: command.metadata.liveExecution !== true,
        }
      : { message: `Command ${command.id} was not executed`, reasons: policy.reasons },
    nextActions: ok ? command.output.resources : policy.decision === "needs_approval" ? ["commitCommand"] : ["learnCommand"],
    policy,
    trace: { requestId, sessionId: context.sessionId, durationMs: Date.now() - startedAt, provider: catalog.provider, cache: "miss", source },
    errors: ok ? undefined : policy.reasons.map((reason) => ({ code: reason.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), message: reason, retryable: policy.decision === "needs_approval" })),
  });
}

function inferCommandShape(tool: ToolContractEntry): CommandShape {
  if (tool.source === "local-ui") return "local-ui";
  const text = `${tool.id} ${tool.title} ${tool.capabilities.join(" ")}`.toLowerCase();
  if (/\b(send|receive|dispatch|inbound|outbound|webhook)\b/.test(text)) return "dispatch";
  if (/\b(list|get|read|search|sync|analytics|insight|availability|preview|learn|catalog)\b/.test(text)) return "record";
  if (/\b(create|update|patch|delete|manage|assign|reserve|commit|confirm)\b/.test(text)) return "catalog";
  if (/\b(media|image|video|audio|file|document)\b/.test(text)) return "media";
  return "composite";
}

function schemaJsonFromRef(ref: ToolSchemaRef): Record<string, unknown> | undefined {
  return ref.kind === "json-schema" && ref.schema && typeof ref.schema === "object" && !Array.isArray(ref.schema)
    ? ref.schema as Record<string, unknown>
    : undefined;
}

function tokenizeCommandText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9:+_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !["and", "the", "for", "with", "from", "into"].includes(token));
}

function commandReceiptRequestId(commandId: string, startedAt: number): string {
  return `cmd_${commandId.replace(/[^a-z0-9]+/gi, "_")}_${startedAt}`;
}
