import { DEFAULT_WORKSPACE_SESSION_NAME } from "@sonik-agent-ui/workspace-session";
import { json } from "@sveltejs/kit";
import { createRequestWorkspaceSession } from "$lib/server/workspace-request-store";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const contentType = event.request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await event.request.json();
    return json(await createRequestWorkspaceSession(event, { name: typeof body.name === "string" ? body.name : DEFAULT_WORKSPACE_SESSION_NAME, mode: body.mode === "artifact" || body.mode === "document" || body.mode === "research" ? body.mode : "chat" }));
  }

  const form = await event.request.formData();
  const formName = form.get("name");
  const name = typeof formName === "string" && formName.trim() ? formName.trim() : "Workspace document session";
  return json(await createRequestWorkspaceSession(event, { name, mode: "document" }));
};
