import { tool } from "ai";
import { z } from "zod";
import {
  executeCatalogCommand,
  learnCommandDescriptor,
  searchCommandCatalogWithMetadata,
  type CommandLearnAspect,
} from "@sonik-agent-ui/tool-contracts";
import { createStandaloneCommandCatalog } from "@sonik-agent-ui/platform-adapters";
import { writeAgentTelemetry } from "$lib/server/agent-telemetry";

const commandAspectSchema = z.enum(["description", "schema", "examples", "policy", "output", "surfaces", "transport", "auth"]);

export function createCommandCatalogTools(context: { sessionId?: string | null; approvedCommandIds?: string[] } = {}) {
  const createCatalog = () => createStandaloneCommandCatalog({ sessionId: context.sessionId });

  return {
    searchCommandCatalog: tool({
      description:
        "Search the compact Sonik Agent UI command catalog before learning or executing commands. Use this instead of loading every tool into context.",
      inputSchema: z.object({
        query: z.string().default("").describe("User-language search query, e.g. artifact, document, booking, weather, tool manifest."),
        limit: z.number().int().min(1).max(20).default(10).describe("Maximum compact command summaries to return."),
      }),
      execute: async ({ query, limit }) => {
        const catalog = createCatalog();
        const result = searchCommandCatalogWithMetadata(catalog, query, limit);
        await writeAgentTelemetry({
          source: "server",
          event: "tool.searchCommandCatalog",
          ok: true,
          mode: "command-catalog",
          elementCount: result.commands.length,
        });
        return { kind: "command-catalog-search" as const, provider: catalog.provider, ...result };
      },
    }),
    learnCommand: tool({
      description:
        "Learn one command's schema, examples, policy, output, transport, and surfaces before executing it. This keeps agent context small and command-specific.",
      inputSchema: z.object({
        commandId: z.string().describe("Command id returned by searchCommandCatalog."),
        aspects: z.array(commandAspectSchema).optional().describe("Optional detail slices to load."),
      }),
      execute: async ({ commandId, aspects }) => {
        const catalog = createCatalog();
        const learned = learnCommandDescriptor(catalog, commandId, aspects as CommandLearnAspect[] | undefined);
        await writeAgentTelemetry({
          source: "server",
          event: "tool.learnCommand",
          ok: Boolean(learned.ok),
          toolCallId: commandId,
        });
        return { kind: "command-learn" as const, ...learned };
      },
    }),
    executeCommand: tool({
      description:
        "Execute a mounted read-only command from the Sonik command catalog. Mutations must use commitCommand and require explicit approval.",
      inputSchema: z.object({
        commandId: z.string().describe("Command id to execute."),
        input: z.record(z.string(), z.unknown()).default({}).describe("Structured command input."),
      }),
      execute: async ({ commandId, input }) => {
        const catalog = createCatalog();
        const receipt = executeCatalogCommand(catalog, commandId, input, {
          action: "execute",
          source: "agent-ui",
          sessionId: context.sessionId,
        });
        await writeAgentTelemetry({
          source: "server",
          event: "tool.executeCommand",
          ok: receipt.ok,
          toolCallId: commandId,
          mode: receipt.policy.decision,
        });
        return { kind: "command-receipt" as const, receipt };
      },
    }),
    commitCommand: tool({
      description:
        "Request commit of an approval-gated command from the Sonik command catalog. Approval is resolved from trusted host/session state, not model-provided booleans. This slice only allows mounted local UI/demo commands; ORPC business mutations remain metadata-only.",
      inputSchema: z.object({
        commandId: z.string().describe("Command id to commit."),
        input: z.record(z.string(), z.unknown()).default({}).describe("Structured command input."),
      }),
      execute: async ({ commandId, input }) => {
        const catalog = createCatalog();
        const receipt = executeCatalogCommand(catalog, commandId, input, {
          action: "commit",
          source: "agent-ui",
          sessionId: context.sessionId,
          approved: context.approvedCommandIds?.includes(commandId) === true,
        });
        await writeAgentTelemetry({
          source: "server",
          event: "tool.commitCommand",
          ok: receipt.ok,
          toolCallId: commandId,
          mode: receipt.policy.decision,
        });
        return { kind: "command-receipt" as const, receipt };
      },
    }),
  };
}
