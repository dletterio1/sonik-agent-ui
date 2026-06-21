import { error, json } from "@sveltejs/kit";
import { patchWorkspaceSession } from "$lib/server/workspace-document-store";

export async function POST({ params, request }) {
  const contentType = request.headers.get("content-type") ?? "";
  let rawValue = "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    rawValue = String(body.important ?? "");
  } else {
    const form = await request.formData();
    const raw = form.get("important");
    rawValue = typeof raw === "string" ? raw : "";
  }
  const is_important = rawValue === "true" || rawValue === "1" || rawValue === "on";
  const session = patchWorkspaceSession(params.id, { is_important });
  if (!session) error(404, "Session not found");
  return json(session);
}
