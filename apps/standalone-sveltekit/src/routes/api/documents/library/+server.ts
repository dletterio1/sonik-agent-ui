import { json } from "@sveltejs/kit";
import { listWorkspaceDocumentLibrary } from "$lib/server/workspace-document-store";

export function GET({ url }) {
  return json(listWorkspaceDocumentLibrary({
    search: url.searchParams.get("search") ?? url.searchParams.get("q"),
    language: url.searchParams.get("language"),
    sort: url.searchParams.get("sort"),
    offset: Number(url.searchParams.get("offset") ?? 0),
    limit: Number(url.searchParams.get("limit") ?? 20),
    archived: url.searchParams.get("archived") === "true",
  }));
}
