import { json } from "@sveltejs/kit";
import { listOdysseusDocumentVersions } from "$lib/server/odysseus-document-store";

export function GET({ params }) {
  return json(listOdysseusDocumentVersions(params.id));
}
