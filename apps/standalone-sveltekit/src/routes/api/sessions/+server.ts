import { json } from "@sveltejs/kit";
import { listOdysseusSessions } from "$lib/server/odysseus-document-store";

export function GET() {
  return json(listOdysseusSessions({ archived: false }));
}
