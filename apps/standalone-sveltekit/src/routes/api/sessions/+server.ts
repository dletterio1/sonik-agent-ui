import { json } from "@sveltejs/kit";
import { listRequestWorkspaceSessions } from "$lib/server/workspace-request-store";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const archived = event.url.searchParams.get("archived") === "true";
  return json(await listRequestWorkspaceSessions(event, { archived }));
};
