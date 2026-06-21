import { json } from "@sveltejs/kit";
import { listWorkspaceSessions } from "$lib/server/workspace-document-store";

export function GET({ url }) {
  const archived = url.searchParams.get("archived") === "true";
  return json(listWorkspaceSessions({ archived }));
}
