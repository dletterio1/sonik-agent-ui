import { error, json } from "@sveltejs/kit";
import { archiveOdysseusDocument } from "$lib/server/odysseus-document-store";

export function POST({ params, url }) {
  const archived = url.searchParams.get("archived") !== "false";
  const document = archiveOdysseusDocument(params.id, archived);
  if (!document) error(404, "Document not found");
  return json(document);
}
