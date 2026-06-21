import {
  createCommandIndexContext,
  createAnonymousHostSessionEnvelope,
  createComposedCommandCatalog,
  createComposedCommandFamilyRegistry,
  createEmbeddedHostSessionEnvelope,
  createStandaloneCommandCatalog,
  createTrustedHostSessionEnvelope,
  filterEligibleHostCommandAdapters,
  platformAdapterContextFromHostSession,
  type HostCommandAdapter,
  type HostCommandRuntimeAdapter,
  type HostSessionEnvelope,
  type PlatformAdapterContext,
} from "@sonik-agent-ui/platform-adapters";
import {
  createStartupCommandIndex,
  createSurfaceCommandIndex,
  type AgentPageContext,
  type CommandCatalog,
  type CommandExecutionContext,
  type CommandFamilyRegistry,
  type CommandIndex,
  type CommandIndexContext,
} from "@sonik-agent-ui/tool-contracts";

export const STANDALONE_HOST_PROVIDER = "standalone-demo-host";
export const STANDALONE_HOST_RUNTIME_PROVIDER = "standalone-demo-host-runtime";
export const STANDALONE_DEMO_ORG_ID = "standalone-demo-org";
export const STANDALONE_DEMO_BOOKING_READ_SCOPE = "booking:read";
export const STANDALONE_DEMO_BOOKING_CONTEXTS_COMMAND_ID = "booking.demo.contexts.list";
export const STANDALONE_DEMO_BOOKING_WRITE_COMMAND_ID = "booking.demo.contexts.create";

const STANDALONE_BOOKING_COMMAND_FAMILY = {
  id: "booking",
  title: "Booking",
  description: "Host-provided booking operations exposed through the command adapter seam.",
  aliases: ["reservations", "contexts"],
  source: "host" as const,
};

export type StandaloneHostSessionMode = "anonymous" | "standalone-demo" | "amplify-embedded";

export type StandaloneHostRuntimeInput = PlatformAdapterContext & {
  hostSession?: HostSessionEnvelope | null;
  hostSessionMode?: StandaloneHostSessionMode;
  hostCommandAdapters?: HostCommandAdapter[];
  hostRuntimeAdapters?: HostCommandRuntimeAdapter[];
  pageContext?: AgentPageContext;
  indexContext?: CommandIndexContext;
  indexLimit?: number;
};

const bookingReadHostAdapter: HostCommandAdapter = {
  provider: STANDALONE_HOST_PROVIDER,
  isEligible: (context) => context.authenticated === true && Boolean(context.organizationId) && (context.scopes ?? []).includes(STANDALONE_DEMO_BOOKING_READ_SCOPE),
  families: [STANDALONE_BOOKING_COMMAND_FAMILY],
  commands: [
    {
      id: STANDALONE_DEMO_BOOKING_CONTEXTS_COMMAND_ID,
      title: "List demo booking contexts",
      description: "Fixture-backed read-only booking context list used to verify host ORPC command runtime binding.",
      familyId: "booking",
      source: "orpc",
      effect: "read",
      approval: "none",
      shape: "record",
      loadPolicy: { mode: "surface-eager", priority: 80, profile: "standalone-demo-host" },
      contextHints: {
        routes: ["/booking", "/workspace"],
        surfaces: ["booking-console", "artifact", "workspace"],
        pageTypes: ["booking"],
        artifactTypes: [],
        skillFamilies: ["booking-ops"],
        commandFamilies: ["booking"],
        requiredScopes: [STANDALONE_DEMO_BOOKING_READ_SCOPE],
      },
      capabilities: ["booking", "context", "read", "demo-host"],
      searchTerms: ["booking", "contexts", "reservations", "host", "orpc", "demo"],
      examples: [{ title: "List booking contexts", input: { limit: 3 } }],
      input: {
        kind: "json-schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { limit: { type: "number", minimum: 1, maximum: 10 } },
        },
      },
      inputSchemaJson: {
        type: "object",
        additionalProperties: false,
        properties: { limit: { type: "number", minimum: 1, maximum: 10 } },
      },
      output: {
        summary: "Returns fixture booking context records with runtime trace metadata.",
        schema: { kind: "json-schema", schema: { type: "object" } },
        resources: [],
      },
      auth: { required: true, orgScoped: true, scopes: [STANDALONE_DEMO_BOOKING_READ_SCOPE] },
      policy: { tags: ["orpc", "read", "booking", "demo-host"], hostProfiles: ["standalone-demo"], readOnly: true, proofTier: "fixture" },
      transport: { procedure: "booking.contexts.list", runtimeStatus: "mounted" },
      surfaces: ["chat", "artifact"],
      uiTargets: ["chat", "artifact"],
      metadata: {
        familyId: "booking",
        loadPolicy: { mode: "surface-eager", priority: 80, profile: "standalone-demo-host" },
        contextHints: {
          routes: ["/booking", "/workspace"],
          surfaces: ["booking-console", "artifact", "workspace"],
          pageTypes: ["booking"],
          skillFamilies: ["booking-ops"],
          commandFamilies: ["booking"],
          requiredScopes: [STANDALONE_DEMO_BOOKING_READ_SCOPE],
        },
        liveExecution: true,
        runtimeAdapterProvider: STANDALONE_HOST_RUNTIME_PROVIDER,
        fixtureOnly: true,
      },
    },
  ],
};

const bookingWriteHostAdapter: HostCommandAdapter = {
  provider: STANDALONE_HOST_PROVIDER,
  isEligible: (context) => context.authenticated === true && Boolean(context.organizationId) && (context.scopes ?? []).includes("booking:write"),
  families: [STANDALONE_BOOKING_COMMAND_FAMILY],
  commands: [
    {
      id: STANDALONE_DEMO_BOOKING_WRITE_COMMAND_ID,
      title: "Create demo booking context",
      description: "Fixture write descriptor that stays non-executable until a trusted host commit adapter is added.",
      familyId: "booking",
      source: "orpc",
      effect: "write",
      approval: "required",
      shape: "catalog",
      loadPolicy: { mode: "lazy", priority: 5, profile: "standalone-demo-host-shadow" },
      contextHints: {
        routes: ["/booking"],
        surfaces: ["booking-console"],
        pageTypes: ["booking"],
        artifactTypes: [],
        skillFamilies: ["booking-ops"],
        commandFamilies: ["booking"],
        requiredScopes: ["booking:write"],
      },
      capabilities: ["booking", "context", "write", "demo-host"],
      searchTerms: ["booking", "contexts", "create", "write", "host", "orpc", "demo"],
      examples: [{ title: "Create booking context", input: { name: "VIP Room" } }],
      input: { kind: "json-schema", schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
      inputSchemaJson: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      output: { summary: "Would create a booking context after trusted host approval.", schema: { kind: "json-schema", schema: { type: "object" } }, resources: [] },
      auth: { required: true, orgScoped: true, scopes: ["booking:write"] },
      policy: { tags: ["orpc", "write", "booking", "demo-host"], hostProfiles: ["standalone-demo"], readOnly: false, proofTier: "fixture" },
      transport: { procedure: "booking.contexts.create", runtimeStatus: "shadow" },
      surfaces: ["chat"],
      uiTargets: ["chat"],
      metadata: {
        familyId: "booking",
        loadPolicy: { mode: "lazy", priority: 5, profile: "standalone-demo-host-shadow" },
        contextHints: {
          routes: ["/booking"],
          surfaces: ["booking-console"],
          pageTypes: ["booking"],
          skillFamilies: ["booking-ops"],
          commandFamilies: ["booking"],
          requiredScopes: ["booking:write"],
        },
        liveExecution: false,
        fixtureOnly: true,
      },
    },
  ],
};

const bookingRuntimeAdapter: HostCommandRuntimeAdapter = {
  provider: STANDALONE_HOST_RUNTIME_PROVIDER,
  bindings: [{
    commandId: STANDALONE_DEMO_BOOKING_CONTEXTS_COMMAND_ID,
    status: "mounted-read",
    execute: (input, context) => {
      const record = typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const rawLimit = typeof record.limit === "number" ? Math.floor(record.limit) : 3;
      const limit = Math.max(1, Math.min(rawLimit, 10));
      const contexts = [
        { id: "ctx-main-room", name: "Main Room", status: "active", capacity: 120 },
        { id: "ctx-rooftop", name: "Rooftop", status: "active", capacity: 80 },
        { id: "ctx-private-dining", name: "Private Dining", status: "paused", capacity: 24 },
      ].slice(0, limit);
      return {
        summary: {
          contexts,
          count: contexts.length,
          fixtureOnly: true,
          procedure: context.command.transport.procedure,
          organizationId: context.execution.organizationId ?? null,
          sessionId: context.execution.sessionId ?? null,
        },
        nextActions: ["learnCommand"],
      };
    },
  }],
};

export function createStandaloneHostCommandAdapters(): HostCommandAdapter[] {
  return [bookingReadHostAdapter, bookingWriteHostAdapter];
}

export function createStandaloneHostRuntimeAdapters(): HostCommandRuntimeAdapter[] {
  return [bookingRuntimeAdapter];
}

export function createStandaloneDemoHostSession(input: PlatformAdapterContext = {}): HostSessionEnvelope {
  return createTrustedHostSessionEnvelope({
    source: "standalone-demo",
    sessionId: input.sessionId ?? null,
    organizationId: input.organizationId ?? STANDALONE_DEMO_ORG_ID,
    scopes: input.scopes ?? [STANDALONE_DEMO_BOOKING_READ_SCOPE],
    metadata: { fixtureOnly: true },
  });
}

export function resolveStandaloneHostSession(input: StandaloneHostRuntimeInput = {}): HostSessionEnvelope {
  if ("hostSession" in input) return input.hostSession ?? createAnonymousHostSessionEnvelope({ sessionId: input.sessionId });
  if (input.hostSessionMode === "standalone-demo") return createStandaloneDemoHostSession(input);
  if (input.hostSessionMode === "amplify-embedded") {
    return createEmbeddedHostSessionEnvelope({
      source: "amplify-embedded",
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      authenticated: input.authenticated,
      scopes: input.scopes,
      metadata: { authAuthority: "server-resolved-amplify-context" },
    });
  }
  return createAnonymousHostSessionEnvelope({ sessionId: input.sessionId });
}

export function createStandaloneHostTrustedContext(input: StandaloneHostRuntimeInput = {}): Required<Pick<PlatformAdapterContext, "authenticated" | "organizationId" | "scopes">> & Pick<PlatformAdapterContext, "sessionId"> {
  const context = platformAdapterContextFromHostSession(resolveStandaloneHostSession(input));
  return {
    sessionId: context.sessionId ?? null,
    authenticated: context.authenticated === true,
    organizationId: context.organizationId ?? null,
    scopes: context.scopes ?? [],
  };
}

export function createStandaloneHostCommandCatalog(input: StandaloneHostRuntimeInput = {}, generatedAt = new Date().toISOString()): CommandCatalog {
  const trusted = createStandaloneHostTrustedContext(input);
  const hostAdapters = filterEligibleHostCommandAdapters(resolveStandaloneHostCommandAdapters(input), trusted);
  return createComposedCommandCatalog(
    STANDALONE_HOST_PROVIDER,
    createStandaloneCommandCatalog(trusted, generatedAt),
    hostAdapters,
    generatedAt,
  );
}

export function createStandaloneHostCommandFamilyRegistry(generatedAt = new Date().toISOString()): CommandFamilyRegistry {
  return createStandaloneHostCommandFamilyRegistryForAdapters(createStandaloneHostCommandAdapters(), generatedAt);
}

function createStandaloneHostCommandFamilyRegistryForAdapters(adapters: HostCommandAdapter[], generatedAt = new Date().toISOString()): CommandFamilyRegistry {
  const seenFamilies = new Map<string, NonNullable<HostCommandAdapter["families"]>[number]>();
  return createComposedCommandFamilyRegistry(STANDALONE_HOST_PROVIDER, adapters.map((adapter) => ({
    ...adapter,
    families: (adapter.families ?? []).filter((family) => {
      const existing = seenFamilies.get(family.id);
      if (!existing) {
        seenFamilies.set(family.id, family);
        return true;
      }
      if (canonicalCommandFamily(existing) !== canonicalCommandFamily(family)) {
        throw new Error(`Conflicting command family id in host adapter composition: ${family.id}`);
      }
      return false;
    }),
  })), generatedAt);
}

function canonicalCommandFamily(family: NonNullable<HostCommandAdapter["families"]>[number]): string {
  return JSON.stringify({
    id: family.id,
    title: family.title,
    description: family.description ?? null,
    parentId: family.parentId ?? null,
    aliases: [...(family.aliases ?? [])].sort(),
    source: family.source,
  });
}

function resolveStandaloneHostCommandAdapters(input: StandaloneHostRuntimeInput): HostCommandAdapter[] {
  return input.hostCommandAdapters ?? createStandaloneHostCommandAdapters();
}

function resolveStandaloneHostRuntimeAdapters(input: StandaloneHostRuntimeInput): HostCommandRuntimeAdapter[] {
  return input.hostRuntimeAdapters ?? createStandaloneHostRuntimeAdapters();
}

function selectRuntimeAdaptersForCatalog(adapters: HostCommandRuntimeAdapter[], catalog: CommandCatalog): HostCommandRuntimeAdapter[] {
  const commandIds = new Set(catalog.commands.map((command) => command.id));
  return adapters
    .map((adapter) => ({ ...adapter, bindings: adapter.bindings.filter((binding) => commandIds.has(binding.commandId)) }))
    .filter((adapter) => adapter.bindings.length > 0);
}

export function createStandaloneHostCommandIndex(input: StandaloneHostRuntimeInput = {}, generatedAt = new Date().toISOString()): CommandIndex {
  const trusted = createStandaloneHostTrustedContext(input);
  const hostAdapters = filterEligibleHostCommandAdapters(resolveStandaloneHostCommandAdapters(input), trusted);
  const catalog = createStandaloneHostCommandCatalog(input, generatedAt);
  const registry = hostAdapters.length > 0
    ? createStandaloneHostCommandFamilyRegistryForAdapters(hostAdapters, generatedAt)
    : createComposedCommandFamilyRegistry(STANDALONE_HOST_PROVIDER, [], generatedAt);
  const indexContext = input.indexContext ?? input.pageContext;
  if (!indexContext) {
    return createStartupCommandIndex(catalog, { registry, limit: input.indexLimit ?? 12, context: trusted });
  }
  return createSurfaceCommandIndex(catalog, createCommandIndexContext(indexContext, trusted), { registry, limit: input.indexLimit ?? 20 });
}

export function createStandaloneHostCommandRuntimeBundle(input: StandaloneHostRuntimeInput = {}, generatedAt = new Date().toISOString()): {
  catalog: CommandCatalog;
  registry: CommandFamilyRegistry;
  runtimeAdapters: HostCommandRuntimeAdapter[];
  executionContext: CommandExecutionContext;
  indexContext: CommandIndexContext;
} {
  const trusted = createStandaloneHostTrustedContext(input);
  const hostSession = resolveStandaloneHostSession(input);
  const hostAdapters = filterEligibleHostCommandAdapters(resolveStandaloneHostCommandAdapters(input), trusted);
  const catalog = createStandaloneHostCommandCatalog(input, generatedAt);
  return {
    catalog,
    registry: hostAdapters.length > 0
      ? createStandaloneHostCommandFamilyRegistryForAdapters(hostAdapters, generatedAt)
      : createComposedCommandFamilyRegistry(STANDALONE_HOST_PROVIDER, [], generatedAt),
    runtimeAdapters: hostAdapters.length > 0 ? selectRuntimeAdaptersForCatalog(resolveStandaloneHostRuntimeAdapters(input), catalog) : [],
    executionContext: {
      source: "agent-ui",
      sessionId: trusted.sessionId,
      principalId: hostSession.principalId ?? null,
      hostSessionSource: hostSession.source,
      hostSessionExpiresAt: hostSession.expiresAt ?? null,
      authenticated: trusted.authenticated,
      organizationId: trusted.organizationId,
      scopes: trusted.scopes,
    },
    indexContext: createCommandIndexContext(input.indexContext ?? input.pageContext ?? {}, trusted),
  };
}
