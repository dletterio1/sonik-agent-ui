import { error, json } from "@sveltejs/kit";
import { getWorkspaceDocumentVersion } from "$lib/server/workspace-document-store";

export function GET({ params }) {
  const version = getWorkspaceDocumentVersion(params.id, Number(params.num));
  if (!version) error(404, "Document version not found");
  return json(version);
}
