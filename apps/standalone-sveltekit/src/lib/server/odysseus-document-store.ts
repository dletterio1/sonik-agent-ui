import {
  archiveWorkspaceDocument,
  archiveWorkspaceSession,
  createWorkspaceDocument,
  createWorkspaceSession,
  deleteWorkspaceDocument,
  ensureWorkspaceSession,
  getWorkspaceDocument,
  getWorkspaceDocumentVersion,
  listDocumentLibrary,
  listWorkspaceDocuments,
  listWorkspaceDocumentVersions,
  listWorkspaceSessions,
  patchWorkspaceDocument,
  patchWorkspaceSession,
  restoreWorkspaceDocumentVersion,
  updateWorkspaceDocument,
  type WorkspaceDocumentRecord,
  type WorkspaceMode,
} from "./workspace-store";

export type OdysseusDocumentRecord = WorkspaceDocumentRecord;

export function createOdysseusSession(input?: string | { id?: string; name?: string | null; mode?: WorkspaceMode; folder?: string | null }) {
  if (typeof input === "string") return createWorkspaceSession({ name: input, mode: "document" });
  return createWorkspaceSession(input ?? { name: "Odysseus document session", mode: "document" });
}

export {
  archiveWorkspaceDocument as archiveOdysseusDocument,
  archiveWorkspaceSession as archiveOdysseusSession,
  createWorkspaceDocument as createOdysseusDocument,
  deleteWorkspaceDocument as deleteOdysseusDocument,
  ensureWorkspaceSession as ensureOdysseusSession,
  getWorkspaceDocument as getOdysseusDocument,
  getWorkspaceDocumentVersion as getOdysseusDocumentVersion,
  listDocumentLibrary as listOdysseusDocumentLibrary,
  listWorkspaceDocuments as listOdysseusDocuments,
  listWorkspaceDocumentVersions as listOdysseusDocumentVersions,
  listWorkspaceSessions as listOdysseusSessions,
  patchWorkspaceDocument as patchOdysseusDocument,
  patchWorkspaceSession as patchOdysseusSession,
  restoreWorkspaceDocumentVersion as restoreOdysseusDocumentVersion,
  updateWorkspaceDocument as updateOdysseusDocument,
};
