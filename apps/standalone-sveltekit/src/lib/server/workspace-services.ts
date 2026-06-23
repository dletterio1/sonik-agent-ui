import {
  createAsyncWorkspacePersistenceAdapter,
  createCloudWorkspaceRuntime,
  createInMemoryWorkspacePersistence,
  createLocalAuthAdapter,
  createMemoryWorkspaceRuntime,
  createWorkspaceServices,
  type AsyncWorkspacePersistenceAdapter,
  type AuthorizedWorkspaceRuntime,
  type MemoryWorkspaceRuntimeReason,
  type ResolvedWorkspaceRuntime,
  type WorkspaceAuthAdapter,
  type WorkspacePersistenceAdapter,
  type WorkspacePersistencePolicy,
  type WorkspaceServices,
  type WorkspaceHostSessionSnapshot,
} from "@sonik-agent-ui/workspace-session";
import { createNeonWorkspaceSqlExecutor } from "./workspace-cloud-sql.ts";

export type WorkspaceRuntimeRequest = {
  platform?: { env?: Record<string, unknown> } | null;
  request?: Request;
  locals?: Record<string, unknown>;
};

export const AGENT_UI_HOST_CONTEXT_HEADER = "x-sonik-agent-ui-host-context";

export type WorkspaceTrustedHostContext = {
  authenticated?: boolean;
  organizationId?: string | null;
  scopes?: string[];
  hostSession?: Partial<WorkspaceHostSessionSnapshot> | null;
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
  readonly code: "cloud-runtime-not-mounted" | "invalid-persistence-policy" | "missing-cloud-database" | "missing-host-context";

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
    const cloudRuntime = tryResolveCloudWorkspaceRuntime(input.event ?? null, correlationIdFromRequest(input.event?.request));
    if (cloudRuntime) return cloudRuntime;
    return {
      ...localWorkspaceRuntime,
      reason: input.memoryReason ?? "cloud-unavailable",
    };
  }

  return resolveCloudWorkspaceRuntime(input.event ?? null, correlationIdFromRequest(input.event?.request));
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
  const runtime = input.persistence && persistencePolicy !== "cloud"
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

export function resolveTrustedHostContextFromRequest(request?: Request | null): WorkspaceTrustedHostContext | null {
  const encoded = request?.headers.get(AGENT_UI_HOST_CONTEXT_HEADER);
  return decodeTrustedHostContext(encoded);
}

export function encodeTrustedHostContextHeader(context: WorkspaceTrustedHostContext): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(context)))).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeTrustedHostContext(value: string | null | undefined): WorkspaceTrustedHostContext | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return normalizeTrustedHostContext(JSON.parse(decodeURIComponent(escape(atob(padded)))));
  } catch {
    try {
      return normalizeTrustedHostContext(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
}

function tryResolveCloudWorkspaceRuntime(event: WorkspaceRuntimeRequest | null, requestId: string): ResolvedWorkspaceRuntime | null {
  try {
    return resolveCloudWorkspaceRuntime(event, requestId);
  } catch {
    return null;
  }
}

function resolveCloudWorkspaceRuntime(event: WorkspaceRuntimeRequest | null, requestId: string): ResolvedWorkspaceRuntime {
  const env = event?.platform?.env ?? null;
  const databaseUrl = readFirstEnvString(env, ["SONIK_AGENT_UI_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL"]);
  if (!databaseUrl) {
    throw new WorkspaceRuntimeResolutionError(
      "missing-cloud-database",
      "Cloud workspace persistence requires SONIK_AGENT_UI_DATABASE_URL, DATABASE_URL, POSTGRES_URL, or NEON_DATABASE_URL in the current Worker env.",
    );
  }
  const hostSession = resolveTrustedHostSessionSnapshot(event?.request);
  if (!hostSession.authenticated || !hostSession.organizationId || !hostSession.userId) {
    throw new WorkspaceRuntimeResolutionError(
      "missing-host-context",
      "Cloud workspace persistence requires authenticated host session context with organizationId and userId.",
    );
  }
  const authorized: AuthorizedWorkspaceRuntime = {
    kind: "cloud",
    env,
    db: createNeonWorkspaceSqlExecutor(databaseUrl),
    userId: hostSession.userId,
    organizationId: hostSession.organizationId,
    principalId: hostSession.principalId ?? null,
    requestId,
    hostSession,
    commandPolicy: {
      allowed: true,
      commandId: "agent-ui.workspace.persistence",
      reasonCode: "host-context-authenticated",
      effectiveScope: "workspace",
      auditRequired: true,
    },
  };
  return createCloudWorkspaceRuntime(authorized);
}

function resolveTrustedHostSessionSnapshot(request?: Request | null): WorkspaceHostSessionSnapshot {
  const context = resolveTrustedHostContextFromRequest(request);
  const hostSession = context?.hostSession ?? {};
  const authenticated = hostSession.authenticated === true || context?.authenticated === true;
  const organizationId = cleanRuntimeString(hostSession.organizationId) ?? cleanRuntimeString(context?.organizationId) ?? null;
  const sessionId = cleanRuntimeString(hostSession.sessionId) ?? request?.headers.get("x-sonik-session-id") ?? null;
  const userId = cleanRuntimeString(hostSession.userId) ?? cleanRuntimeString(hostSession.principalId) ?? cleanRuntimeString(sessionId) ?? null;
  const principalId = cleanRuntimeString(hostSession.principalId) ?? userId;
  const scopes = normalizeScopes(hostSession.scopes ?? context?.scopes ?? []);
  return {
    source: cleanRuntimeString(hostSession.source) ?? "embedded-host",
    sessionId,
    userId,
    principalId,
    organizationId,
    authenticated,
    scopes,
    expiresAt: cleanRuntimeString(hostSession.expiresAt) ?? null,
    metadata: isRecord(hostSession.metadata) ? hostSession.metadata : { authAuthority: "host-asserted-embed-context" },
  };
}

function normalizeTrustedHostContext(value: unknown): WorkspaceTrustedHostContext | null {
  if (!isRecord(value)) return null;
  return {
    authenticated: typeof value.authenticated === "boolean" ? value.authenticated : undefined,
    organizationId: cleanRuntimeString(value.organizationId) ?? null,
    scopes: normalizeScopes(value.scopes),
    hostSession: isRecord(value.hostSession) ? value.hostSession as Partial<WorkspaceHostSessionSnapshot> : null,
  };
}

function normalizeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanRuntimeString).filter((scope): scope is string => Boolean(scope)))].slice(0, 32).sort();
}

function cleanRuntimeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 256) : null;
}

function correlationIdFromRequest(request?: Request | null): string {
  return request?.headers.get("x-sonik-request-id") ?? request?.headers.get("x-request-id") ?? globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}`;
}

function readEnvString(env: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = env?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFirstEnvString(env: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = readEnvString(env, key);
    if (value) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
