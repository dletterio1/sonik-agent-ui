import { error, json } from "@sveltejs/kit";
import { deleteOdysseusDocument, getOdysseusDocument, patchOdysseusDocument, updateOdysseusDocument } from "$lib/server/odysseus-document-store";
import {
  optionalRouteString,
  WORKSPACE_CONTENT_MAX_CHARS,
  WORKSPACE_LANGUAGE_MAX_CHARS,
  WORKSPACE_SESSION_ID_MAX_CHARS,
  WORKSPACE_TITLE_MAX_CHARS,
} from "$lib/server/workspace-route-limits";

export function GET({ params }) {
  const document = getOdysseusDocument(params.id);
  if (!document) error(404, "Document not found");
  return json(document);
}

export async function PUT({ params, request }) {
  const body = await request.json();
  const document = updateOdysseusDocument(params.id, {
    content: optionalRouteString(body.content, "content", WORKSPACE_CONTENT_MAX_CHARS),
    title: optionalRouteString(body.title, "title", WORKSPACE_TITLE_MAX_CHARS),
    language: optionalRouteString(body.language, "language", WORKSPACE_LANGUAGE_MAX_CHARS),
  });
  if (!document) error(404, "Document not found");
  return json(document);
}

export async function PATCH({ params, request }) {
  const body = await request.json();
  const document = patchOdysseusDocument(params.id, {
    content: optionalRouteString(body.content, "content", WORKSPACE_CONTENT_MAX_CHARS),
    title: optionalRouteString(body.title, "title", WORKSPACE_TITLE_MAX_CHARS),
    language: optionalRouteString(body.language, "language", WORKSPACE_LANGUAGE_MAX_CHARS),
    session_id: optionalRouteString(body.session_id, "session_id", WORKSPACE_SESSION_ID_MAX_CHARS),
  });
  if (!document) error(404, "Document not found");
  return json(document);
}

export function DELETE({ params }) {
  deleteOdysseusDocument(params.id);
  return json({ ok: true });
}
