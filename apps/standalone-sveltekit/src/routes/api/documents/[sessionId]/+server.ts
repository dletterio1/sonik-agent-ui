import { json } from "@sveltejs/kit";
import { listWorkspaceDocuments } from "$lib/server/workspace-document-store";

export function GET({ params }) {
  return json(listWorkspaceDocuments(params.sessionId));
}
