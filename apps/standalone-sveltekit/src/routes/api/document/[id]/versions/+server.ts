import { json } from "@sveltejs/kit";
import { listWorkspaceDocumentVersions } from "$lib/server/workspace-document-store";

export function GET({ params }) {
  return json(listWorkspaceDocumentVersions(params.id));
}
