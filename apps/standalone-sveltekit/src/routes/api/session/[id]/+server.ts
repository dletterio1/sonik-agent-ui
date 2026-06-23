import { error, json } from "@sveltejs/kit";
import {
  deleteRequestWorkspaceSession,
  ensureRequestWorkspaceSession,
  getRequestWorkspaceDocument,
  getRequestWorkspaceSession,
  listRequestWorkspaceDocuments,
  listRequestWorkspaceMessages,
  listRequestWorkspaceTelemetryEvents,
  patchRequestWorkspaceSession,
} from "$lib/server/workspace-request-store";
import { routeString, WORKSPACE_TITLE_MAX_CHARS } from "$lib/server/workspace-route-limits";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const session = await getRequestWorkspaceSession(event, event.params.id);
  if (!session) error(404, "Session not found");

  return json({
    session,
    documents: await listRequestWorkspaceDocuments(event, session.id),
    activeDocument: session.active_document_id ? await getRequestWorkspaceDocument(event, session.active_document_id) : null,
    messages: await listRequestWorkspaceMessages(event, session.id),
    telemetry: (await listRequestWorkspaceTelemetryEvents(event, session.id)).slice(-50),
    artifactState: {
      persistence: "cloud-or-memory-v0",
      activeArtifactId: session.active_artifact_id,
      note: "JSON-render artifacts are restored by the artifact warehouse slice; document artifacts are persisted with workspace sessions.",
    },
  });
};

export const PATCH: RequestHandler = async (event) => {
  const session = (await getRequestWorkspaceSession(event, event.params.id)) ?? (await ensureRequestWorkspaceSession(event, event.params.id));

  let body: Record<string, unknown>;
  try {
    const parsed = await event.request.json();
    if (!isRecord(parsed)) error(400, "Session patch payload must be a JSON object");
    body = parsed;
  } catch (caught) {
    if (caught && typeof caught === "object" && "status" in caught) throw caught;
    error(400, "Invalid JSON session patch payload");
  }

  const name = routeString(body.name, "name", WORKSPACE_TITLE_MAX_CHARS, "").trim();
  if (!name) error(400, "Session name is required");
  const updated = await patchRequestWorkspaceSession(event, session.id, { name });
  if (!updated) error(404, "Session not found");
  return json(updated);
};

export const DELETE: RequestHandler = async (event) => {
  const session = await getRequestWorkspaceSession(event, event.params.id);
  if (!session) error(404, "Session not found");
  const deleted = await deleteRequestWorkspaceSession(event, session.id);
  if (!deleted) error(404, "Session not found");
  return json({ id: session.id, deleted: true });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
