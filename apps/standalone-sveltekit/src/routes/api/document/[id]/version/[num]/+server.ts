import { error, json } from "@sveltejs/kit";
import { getOdysseusDocumentVersion } from "$lib/server/odysseus-document-store";

export function GET({ params }) {
  const version = getOdysseusDocumentVersion(params.id, Number(params.num));
  if (!version) error(404, "Document version not found");
  return json(version);
}
