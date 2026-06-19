import assert from "node:assert/strict";
import {
  archiveWorkspaceDocument,
  archiveWorkspaceSession,
  createWorkspaceArtifact,
  createWorkspaceDocument,
  createWorkspaceSession,
  getWorkspaceDocument,
  getWorkspaceDocumentVersion,
  listDocumentLibrary,
  listWorkspaceDocumentVersions,
  listWorkspaceDocuments,
  listWorkspaceSessions,
  patchWorkspaceSession,
  restoreWorkspaceDocumentVersion,
  updateWorkspaceDocument,
  workspaceProcedures,
} from "../../apps/standalone-sveltekit/src/lib/server/workspace-store.ts";
import {
  findDocumentArtifactToolCandidate,
  isDocumentArtifactToolOutput,
} from "../../apps/standalone-sveltekit/src/lib/artifacts/tool-artifact-extraction.ts";

const session = createWorkspaceSession({ id: "test-session", name: "Test Session", mode: "document" });
assert.equal(session.id, "test-session");
assert.equal(listWorkspaceSessions({ archived: false }).some((entry) => entry.id === "test-session"), true);

const document = createWorkspaceDocument({
  session_id: session.id,
  title: "Run Sheet",
  language: "markdown",
  content: "# Run Sheet\n\nInitial",
  source: "ai",
});
assert.equal(document.session_id, session.id);
assert.equal(document.version_count, 1);
assert.equal(getWorkspaceDocument(document.id)?.current_content, "# Run Sheet\n\nInitial");
assert.equal(listWorkspaceDocuments(session.id).length, 1);

const updated = updateWorkspaceDocument(document.id, {
  content: "# Run Sheet\n\nUpdated",
  summary: "Agent edit",
  source: "ai",
});
assert.equal(updated?.version_count, 2);
assert.equal(listWorkspaceDocumentVersions(document.id).length, 2);
assert.equal(getWorkspaceDocumentVersion(document.id, 1)?.content, "# Run Sheet\n\nInitial");

const restored = restoreWorkspaceDocumentVersion(document.id, 1);
assert.equal(restored?.current_content, "# Run Sheet\n\nInitial");
assert.equal(restored?.version_count, 3);

const library = listDocumentLibrary({ search: "sheet", limit: 10 });
assert.equal(library.total >= 1, true);
assert.equal(library.languages.markdown >= 1, true);
assert.equal(library.session_count >= 1, true);

const artifact = createWorkspaceArtifact({
  session_id: session.id,
  kind: "document",
  title: restored.title,
  content: restored,
});
assert.equal(artifact.kind, "document");

const toolOutput = {
  kind: "document-artifact",
  action: "create",
  document: restored,
  artifactId: artifact.id,
};
assert.equal(isDocumentArtifactToolOutput(toolOutput), true);
const candidate = findDocumentArtifactToolCandidate("assistant-message", [
  { type: "tool-createDocumentArtifact", toolCallId: "call_doc", output: toolOutput },
]);
assert.equal(candidate?.id, "document-tool:assistant-message:call_doc");
assert.equal(candidate?.document.id, restored.id);

assert.equal(typeof workspaceProcedures["workspace.document.create"], "function");
assert.equal(typeof workspaceProcedures["workspace.document.library"], "function");
assert.equal(typeof workspaceProcedures["workspace.artifact.create"], "function");

assert.equal(archiveWorkspaceDocument(document.id, true)?.archived, true);
assert.equal(listDocumentLibrary({ search: "sheet" }).documents.some((entry) => entry.id === document.id), false);
assert.equal(listDocumentLibrary({ search: "sheet", archived: true }).documents.some((entry) => entry.id === document.id), true);

assert.equal(patchWorkspaceSession(session.id, { is_important: true })?.is_important, true);
assert.equal(archiveWorkspaceSession(session.id, true)?.archived, true);
assert.equal(listWorkspaceSessions({ archived: true }).some((entry) => entry.id === session.id), true);

console.log("workspace-store tests passed");

const stale = createWorkspaceDocument({
  session_id: "fresh-session",
  title: "Fresh Context",
  language: "markdown",
  content: "old content",
  source: "user",
});
const fresh = (await import("../../apps/standalone-sveltekit/src/lib/server/workspace-store.ts")).syncActiveWorkspaceDocumentSnapshot({
  ...stale,
  current_content: "fresh iframe content",
});
assert.equal(fresh.current_content, "fresh iframe content", "active iframe snapshot should win over stale store content");
assert.equal(getWorkspaceDocument(stale.id)?.current_content, "fresh iframe content", "fresh snapshot should be persisted before agent tools run");

const { routeString, WORKSPACE_CONTENT_MAX_CHARS } = await import(
  "../../apps/standalone-sveltekit/src/lib/server/workspace-route-limits.ts"
);
assert.equal(routeString(undefined, "content", 10, "default"), "default");
assert.throws(() => routeString("x".repeat(WORKSPACE_CONTENT_MAX_CHARS + 1), "content", WORKSPACE_CONTENT_MAX_CHARS), /exceeds/);

const hostHtml = await import("node:fs/promises").then((fs) => fs.readFile("apps/standalone-sveltekit/static/odysseus-document-host.html", "utf8"));
assert.equal(hostHtml.includes("creating a new local copy"), false, "host must not fork identity when documentId load fails");
assert.equal(hostHtml.includes("message.source !== 'sonik-agent-ui-parent'"), true, "host should reject non-parent bridge messages");

assert.equal(hostHtml.includes("hasReceivedParentOpenRequest"), true, "host should track parent open requests");
assert.equal(hostHtml.includes("!hasReceivedParentOpenRequest && !document.getElementById('doc-editor-pane')"), true, "default open should not race requested document opens");

const generateRoute = await import("node:fs/promises").then((fs) => fs.readFile("apps/standalone-sveltekit/src/routes/api/generate/+server.ts", "utf8"));
assert.equal(generateRoute.includes("WORKSPACE_CONTENT_MAX_CHARS"), true, "generate active-document sync should use route content limits");
assert.equal(generateRoute.includes("workspace.activeDocument.current_content"), true, "generate active-document sync should validate active content field");

const preferredToolOutput = {
  kind: "document-artifact",
  action: "create",
  document: restored,
  artifactId: artifact.id,
  preferredView: "preview",
};
assert.equal(isDocumentArtifactToolOutput(preferredToolOutput), true, "document artifact output should accept preferredView");
const preferredCandidate = findDocumentArtifactToolCandidate("assistant-message", [
  { type: "tool-createDocumentArtifact", toolCallId: "call_doc_view", output: preferredToolOutput },
]);
assert.equal(preferredCandidate?.preferredView, "preview", "preferredView should pass through document tool extraction");

const documentToolSource = await import("node:fs/promises").then((fs) => fs.readFile("apps/standalone-sveltekit/src/lib/tools/document.ts", "utf8"));
assert.equal(documentToolSource.includes("const runtime: DocumentToolRuntime"), true, "document tools should keep same-turn runtime state");
assert.equal(documentToolSource.includes("runtime.activeDocument = document"), true, "document create/update/read should refresh same-turn active document");
assert.equal(documentToolSource.includes("readDocumentArtifact"), true, "specific document read tool should be available for verification loops");
assert.equal(documentToolSource.includes("preferredDocumentViewSchema"), true, "document tools should expose preferred view schema");

const frameSource = await import("node:fs/promises").then((fs) => fs.readFile("packages/workspace-core/src/components/OdysseusDocumentFrame.svelte", "utf8"));
assert.equal(frameSource.includes("preferredView?: PreferredDocumentView"), true, "Svelte wrapper should expose preferredView prop");
assert.equal(frameSource.includes("content, preferredView"), true, "Svelte wrapper should post preferredView to host payload");

assert.equal(hostHtml.includes("function applyPreferredView"), true, "host should apply preferred view without editing copied Odysseus source");
assert.equal(hostHtml.includes("#doc-render-view-toggle [data-renderview="), true, "host should use Odysseus HTML/SVG/XML view toggle");
assert.equal(hostHtml.includes("#doc-md-view-toggle [data-mdview="), true, "host should use Odysseus markdown preview toggle");
assert.equal(hostHtml.includes("document_host.preferred_view_applied"), true, "host should log preferred view telemetry");

const telemetryRoute = await import("node:fs/promises").then((fs) => fs.readFile("apps/standalone-sveltekit/src/routes/api/telemetry/+server.ts", "utf8"));
assert.equal(telemetryRoute.includes("writeAgentTelemetry"), true, "telemetry API should persist accepted events");
const telemetryServer = await import("node:fs/promises").then((fs) => fs.readFile("apps/standalone-sveltekit/src/lib/server/agent-telemetry.ts", "utf8"));
assert.equal(telemetryServer.includes("agent-ui-telemetry.jsonl"), true, "server telemetry should write local JSONL logs");
assert.equal(generateRoute.includes("api.generate.stream_attached"), true, "generate route should log stream attachment");
