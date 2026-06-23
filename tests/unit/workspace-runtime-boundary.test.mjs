import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAsyncWorkspacePersistenceAdapter,
  createInMemoryWorkspacePersistence,
  createMemoryWorkspaceRuntime,
} from "../../packages/workspace-session/src/index.ts";
import {
  AGENT_UI_HOST_CONTEXT_HEADER,
  WorkspaceRuntimeResolutionError,
  createRequestWorkspaceServices,
  encodeTrustedHostContextHeader,
  resolveWorkspacePersistencePolicy,
  resolveWorkspaceRuntime,
} from "../../apps/standalone-sveltekit/src/lib/server/workspace-services.ts";

const syncPersistence = createInMemoryWorkspacePersistence();
const asyncPersistence = createAsyncWorkspacePersistenceAdapter(syncPersistence);
const session = await asyncPersistence.createSession({ id: "async-boundary-session", name: "Async Boundary" });
await asyncPersistence.appendMessage({ session_id: session.id, role: "user", content: "persist through async facade" });
assert.equal((await asyncPersistence.getSession(session.id))?.message_count, 1, "async wrapper should preserve sync adapter behavior");
assert.equal((await asyncPersistence.listMessages(session.id))[0]?.content, "persist through async facade");

const memoryRuntime = createMemoryWorkspaceRuntime({ persistence: syncPersistence, reason: "local" });
assert.equal(memoryRuntime.kind, "memory");
assert.equal(memoryRuntime.reason, "local");
assert.equal((await memoryRuntime.persistence.getSession(session.id))?.id, session.id);

assert.equal(resolveWorkspacePersistencePolicy(), "memory", "default request policy should preserve local memory behavior");
assert.equal(resolveWorkspacePersistencePolicy({ env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "auto" } }), "auto");
assert.throws(
  () => resolveWorkspacePersistencePolicy({ env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "sqlite" } }),
  WorkspaceRuntimeResolutionError,
  "invalid persistence mode should fail closed",
);
assert.throws(
  () => resolveWorkspacePersistencePolicy({ env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud" }, override: "memory" }),
  /cloud is authoritative/,
  "explicit cloud env should not be downgradable by caller policy",
);

const localServices = createRequestWorkspaceServices(null);
assert.equal(localServices.persistencePolicy, "memory");
assert.equal(localServices.persistenceMode, "memory");
assert.equal(localServices.runtime.kind, "memory");
assert.equal((await localServices.persistence.createSession({ id: "request-local-session" })).id, "request-local-session");

const autoRuntime = resolveWorkspaceRuntime({ event: { platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "auto" } } } });
assert.equal(autoRuntime.kind, "memory", "auto policy should fall back to memory when DB/host context are unavailable");
assert.equal(autoRuntime.kind === "memory" ? autoRuntime.reason : null, "cloud-unavailable");

assert.throws(
  () => resolveWorkspaceRuntime({ event: { platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud" } } } }),
  /requires SONIK_AGENT_UI_DATABASE_URL/,
  "explicit cloud mode should fail closed when DB env is missing",
);

assert.throws(
  () => resolveWorkspaceRuntime({ event: { platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud", SONIK_AGENT_UI_DATABASE_URL: "postgres://user:pass@example.neon.tech/db" } } } }),
  /requires authenticated host session context/,
  "explicit cloud mode should fail closed when authenticated host context is missing",
);

const hostContextHeader = encodeTrustedHostContextHeader({
  authenticated: true,
  organizationId: "org-a",
  scopes: ["workspace:read", "workspace:write"],
  hostSession: {
    source: "amplify-embedded",
    sessionId: "host-session-a",
    userId: "user-a",
    principalId: "principal-a",
    organizationId: "org-a",
    authenticated: true,
    scopes: ["workspace:read", "workspace:write"],
  },
});
const cloudEvent = {
  platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud", SONIK_AGENT_UI_DATABASE_URL: "postgres://user:pass@example.neon.tech/db" } },
  request: new Request("https://agent.example/api/session", { headers: { [AGENT_UI_HOST_CONTEXT_HEADER]: hostContextHeader, "x-sonik-request-id": "request-a" } }),
};
const cloudRuntime = resolveWorkspaceRuntime({ event: cloudEvent });
assert.equal(cloudRuntime.kind, "cloud", "explicit cloud mode should mount the cloud runtime when DB and trusted host context are present");
assert.equal(cloudRuntime.kind === "cloud" ? cloudRuntime.authorized.organizationId : null, "org-a");
assert.equal(cloudRuntime.kind === "cloud" ? cloudRuntime.authorized.userId : null, "user-a");

assert.throws(
  () => resolveWorkspaceRuntime({ event: { platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud" } } }, policy: "memory" }),
  /cloud is authoritative/,
  "direct runtime resolution should not downgrade cloud env with caller policy",
);

assert.throws(
  () => createRequestWorkspaceServices(null, { policy: "cloud", persistence: createInMemoryWorkspacePersistence() }),
  /requires SONIK_AGENT_UI_DATABASE_URL/,
  "explicit cloud mode should fail closed even if a test/local persistence adapter is supplied",
);
assert.throws(
  () => createRequestWorkspaceServices({ platform: { env: { SONIK_AGENT_UI_PERSISTENCE_MODE: "cloud" } } }, { policy: "memory" }),
  /cloud is authoritative/,
  "request env cloud mode should be authoritative over caller policy",
);

const routeFiles = await collectFiles("apps/standalone-sveltekit/src/routes/api");
const cloudMarkers = [
  "createRequestWorkspaceServices",
  "resolveWorkspaceRuntime",
  "SONIK_AGENT_UI_PERSISTENCE_MODE",
  "cloud-v0",
];
const singletonImportMarkers = [
  "from \"$lib/server/workspace-store",
  "from '$lib/server/workspace-store",
  "from \"../../../lib/server/workspace-store",
  "from '../../../lib/server/workspace-store",
  "from \"$lib/server/workspace-document-store",
  "from '$lib/server/workspace-document-store",
  "from \"../../../lib/server/workspace-document-store",
  "from '../../../lib/server/workspace-document-store",
];
const singletonIdentifierMarkers = [
  "getWorkspacePersistenceAdapter",
  "workspaceServices.persistence",
  "workspacePersistence",
];
const localOnlySingletonRouteAllowlist = new Set([]);

let singletonBackedRouteCount = 0;
for (const file of routeFiles) {
  const source = await readFile(file, "utf8");
  const importsSingleton = singletonImportMarkers.some((marker) => source.includes(marker));
  const usesSingletonIdentifier = singletonIdentifierMarkers.some((marker) => source.includes(marker));
  const isSingletonBacked = importsSingleton || usesSingletonIdentifier;
  const isCloudEnabled = cloudMarkers.some((marker) => source.includes(marker));
  if (isSingletonBacked) {
    singletonBackedRouteCount += 1;
    assert.equal(
      localOnlySingletonRouteAllowlist.has(file),
      true,
      `singleton-backed workspace route ${file} must be explicitly allowlisted as local-only compatibility`,
    );
  }
  if (!isCloudEnabled) continue;
  assert.equal(isSingletonBacked, false, `cloud-enabled route ${file} must not use singleton-backed workspace persistence`);
}
assert.equal(singletonBackedRouteCount, localOnlySingletonRouteAllowlist.size, "local-only singleton route allowlist must match the current import graph exactly");

const servicesSource = await readFile("apps/standalone-sveltekit/src/lib/server/workspace-services.ts", "utf8");
assert.equal(servicesSource.includes("createCloudWorkspaceRuntime"), true, "cloud runtime should be mounted through the workspace-session adapter");
assert.equal(servicesSource.includes("SONIK_AGENT_UI_DATABASE_URL"), true, "cloud runtime should use current Worker env database bindings");
assert.equal(servicesSource.includes("process.env"), false, "request runtime resolver must not use ambient process.env for deployed policy");

console.log("workspace-runtime-boundary tests passed");

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    if (entry.isFile() && path.endsWith(".ts")) files.push(path);
  }
  return files;
}
