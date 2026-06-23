import {
  createAsyncWorkspacePersistenceAdapter,
  createInMemoryWorkspacePersistence,
  createLocalAuthAdapter,
  createMemoryWorkspaceRuntime,
  createWorkspaceServices,
  type AsyncWorkspacePersistenceAdapter,
  type MemoryWorkspaceRuntimeReason,
  type ResolvedWorkspaceRuntime,
  type WorkspaceAuthAdapter,
  type WorkspacePersistenceAdapter,
  type WorkspacePersistencePolicy,
  type WorkspaceServices,
} from "@sonik-agent-ui/workspace-session";

export type WorkspaceRuntimeRequest = {
  platform?: { env?: Record<string, unknown> } | null;
  request?: Request;
  locals?: Record<string, unknown>;
};

export type RequestWorkspaceServices = {
  runtime: ResolvedWorkspaceRuntime;
  persistence: AsyncWorkspacePersistenceAdapter;
  auth: WorkspaceAuthAdapter;
  persistencePolicy: WorkspacePersistencePolicy;
  persistenceMode: ResolvedWorkspaceRuntime["kind"];
};

const localWorkspacePersistence = createInMemoryWorkspacePersistence();
const localWorkspaceRuntime = createMemoryWorkspaceRuntime({
  persistence: localWorkspacePersistence,
  reason: "local",
});
const localWorkspaceAuth = createLocalAuthAdapter();

export function createStandaloneWorkspaceServices(): WorkspaceServices {
  return createWorkspaceServices({
    persistence: localWorkspacePersistence,
    auth: localWorkspaceAuth,
  });
}

export const workspaceServices = createStandaloneWorkspaceServices();

export class WorkspaceRuntimeResolutionError extends Error {
  readonly code: "cloud-runtime-not-mounted" | "invalid-persistence-policy";

  constructor(code: WorkspaceRuntimeResolutionError["code"], message: string) {
    super(message);
    this.name = "WorkspaceRuntimeResolutionError";
    this.code = code;
  }
}

export function resolveWorkspacePersistencePolicy(input: {
  env?: Record<string, unknown> | null;
  override?: string | null;
} = {}): WorkspacePersistencePolicy {
  const envPolicy = parseWorkspacePersistencePolicy(readEnvString(input.env, "SONIK_AGENT_UI_PERSISTENCE_MODE"), "SONIK_AGENT_UI_PERSISTENCE_MODE");
  const overridePolicy = parseWorkspacePersistencePolicy(input.override ?? null, "workspace persistence policy override");
  if (envPolicy === "cloud" && overridePolicy && overridePolicy !== "cloud") {
    throw new WorkspaceRuntimeResolutionError(
      "invalid-persistence-policy",
      "SONIK_AGENT_UI_PERSISTENCE_MODE=cloud is authoritative and cannot be downgraded by a caller-supplied policy.",
    );
  }
  return overridePolicy ?? envPolicy ?? "memory";
}

export function resolveWorkspaceRuntime(input: {
  event?: WorkspaceRuntimeRequest | null;
  policy?: WorkspacePersistencePolicy;
  memoryReason?: MemoryWorkspaceRuntimeReason;
} = {}): ResolvedWorkspaceRuntime {
  const env = input.event?.platform?.env ?? null;
  const policy = resolveWorkspacePersistencePolicy({ env, override: input.policy });

  if (policy === "memory") {
    return localWorkspaceRuntime;
  }

  if (policy === "auto") {
    return {
      ...localWorkspaceRuntime,
      reason: input.memoryReason ?? "cloud-unavailable",
    };
  }

  // Slice 1 deliberately creates the request-scoped boundary before mounting SQL.
  // Explicit cloud mode must fail closed instead of silently falling back to memory.
  throw new WorkspaceRuntimeResolutionError(
    "cloud-runtime-not-mounted",
    "Cloud workspace persistence is not mounted in Slice 1. Add an AuthorizedWorkspaceRuntime and cloud adapter before enabling cloud mode.",
  );
}

export function createRequestWorkspaceServices(event?: WorkspaceRuntimeRequest | null, input: {
  policy?: WorkspacePersistencePolicy;
  memoryReason?: MemoryWorkspaceRuntimeReason;
  persistence?: WorkspacePersistenceAdapter;
} = {}): RequestWorkspaceServices {
  const env = event?.platform?.env ?? null;
  const persistencePolicy = resolveWorkspacePersistencePolicy({ env, override: input.policy });
  if (persistencePolicy === "cloud") {
    // Test/local injection must not bypass the explicit cloud-mode fail-closed boundary.
    resolveWorkspaceRuntime({ event, policy: persistencePolicy, memoryReason: input.memoryReason });
  }
  const runtime = input.persistence
    ? createMemoryWorkspaceRuntime({ persistence: input.persistence, reason: input.memoryReason ?? "local" })
    : resolveWorkspaceRuntime({ event, policy: persistencePolicy, memoryReason: input.memoryReason });

  return {
    runtime,
    persistence: runtime.persistence,
    auth: localWorkspaceAuth,
    persistencePolicy,
    persistenceMode: runtime.kind,
  };
}

export function createAsyncLocalWorkspacePersistence(): AsyncWorkspacePersistenceAdapter {
  return createAsyncWorkspacePersistenceAdapter(localWorkspacePersistence);
}

function parseWorkspacePersistencePolicy(value: string | null, label: string): WorkspacePersistencePolicy | null {
  if (value === null) return null;
  if (value === "memory" || value === "cloud" || value === "auto") return value;
  throw new WorkspaceRuntimeResolutionError(
    "invalid-persistence-policy",
    `Invalid ${label}=${JSON.stringify(value)}. Expected memory, cloud, or auto.`,
  );
}

function readEnvString(env: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
