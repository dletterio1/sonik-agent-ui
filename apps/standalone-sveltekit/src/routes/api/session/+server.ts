import { DEFAULT_WORKSPACE_SESSION_NAME } from "@sonik-agent-ui/workspace-session";
import { json } from "@sveltejs/kit";
import { createOdysseusSession } from "$lib/server/odysseus-document-store";

export async function POST({ request }) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return json(createOdysseusSession({ name: typeof body.name === "string" ? body.name : DEFAULT_WORKSPACE_SESSION_NAME, mode: body.mode === "artifact" || body.mode === "document" || body.mode === "research" ? body.mode : "chat" }));
  }

  const form = await request.formData();
  const formName = form.get("name");
  const name = typeof formName === "string" && formName.trim() ? formName.trim() : "Odysseus document session";
  return json(createOdysseusSession(name));
}
