import { error, json } from "@sveltejs/kit";
import { archiveWorkspaceDocument } from "$lib/server/workspace-document-store";

export function POST({ params, url }) {
  const archived = url.searchParams.get("archived") !== "false";
  const document = archiveWorkspaceDocument(params.id, archived);
  if (!document) error(404, "Document not found");
  return json(document);
}
