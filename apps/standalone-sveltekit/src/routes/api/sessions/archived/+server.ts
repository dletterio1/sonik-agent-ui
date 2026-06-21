import { json } from "@sveltejs/kit";
import { listWorkspaceSessions } from "$lib/server/workspace-document-store";

export function GET() {
  return json(listWorkspaceSessions({ archived: true }));
}
