import { error, json } from "@sveltejs/kit";
import { restoreWorkspaceDocumentVersion } from "$lib/server/workspace-document-store";

export function POST({ params }) {
  const document = restoreWorkspaceDocumentVersion(params.id, Number(params.num));
  if (!document) error(404, "Document version not found");
  return json(document);
}
