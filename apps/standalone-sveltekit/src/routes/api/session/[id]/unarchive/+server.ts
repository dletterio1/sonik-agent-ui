import { error, json } from "@sveltejs/kit";
import { archiveWorkspaceSession } from "$lib/server/workspace-document-store";

export function POST({ params }) {
  const session = archiveWorkspaceSession(params.id, false);
  if (!session) error(404, "Session not found");
  return json(session);
}
