import { error, json } from "@sveltejs/kit";
import {
  getOdysseusDocument,
  getOdysseusSession,
  listOdysseusDocuments,
} from "$lib/server/odysseus-document-store";
import {
  listWorkspaceMessages,
  listWorkspaceTelemetryEvents,
} from "$lib/server/workspace-store";

export function GET({ params }) {
  const session = getOdysseusSession(params.id);
  if (!session) error(404, "Session not found");

  return json({
    session,
    documents: listOdysseusDocuments(session.id),
    activeDocument: session.active_document_id ? getOdysseusDocument(session.active_document_id) : null,
    messages: listWorkspaceMessages(session.id),
    telemetry: listWorkspaceTelemetryEvents(session.id).slice(-50),
    artifactState: {
      persistence: "ephemeral-v0",
      activeArtifactId: session.active_artifact_id,
      note: "JSON-render artifacts are live UI state in v0; durable restore belongs to the artifact warehouse slice.",
    },
  });
}
