import { error, json } from "@sveltejs/kit";
import { restoreOdysseusDocumentVersion } from "$lib/server/odysseus-document-store";

export function POST({ params }) {
  const document = restoreOdysseusDocumentVersion(params.id, Number(params.num));
  if (!document) error(404, "Document version not found");
  return json(document);
}
