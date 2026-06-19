import { json } from "@sveltejs/kit";
import { listOdysseusDocuments } from "$lib/server/odysseus-document-store";

export function GET({ params }) {
  return json(listOdysseusDocuments(params.sessionId));
}
