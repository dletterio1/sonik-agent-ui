import { error, json } from "@sveltejs/kit";
import { archiveOdysseusSession } from "$lib/server/odysseus-document-store";

export function POST({ params }) {
  const session = archiveOdysseusSession(params.id, true);
  if (!session) error(404, "Session not found");
  return json(session);
}
