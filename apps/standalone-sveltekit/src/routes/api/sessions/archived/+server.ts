import { json } from "@sveltejs/kit";
import { listRequestWorkspaceSessions } from "$lib/server/workspace-request-store";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  return json(await listRequestWorkspaceSessions(event, { archived: true }));
};
