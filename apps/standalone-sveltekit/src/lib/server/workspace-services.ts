import {
  createInMemoryWorkspacePersistence,
  createLocalAuthAdapter,
  createWorkspaceServices,
  type WorkspaceServices,
} from "@sonik-agent-ui/workspace-session";

export function createStandaloneWorkspaceServices(): WorkspaceServices {
  return createWorkspaceServices({
    persistence: createInMemoryWorkspacePersistence(),
    auth: createLocalAuthAdapter(),
  });
}

export const workspaceServices = createStandaloneWorkspaceServices();
