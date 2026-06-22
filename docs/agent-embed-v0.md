# Sonik Agent UI embedding v0

The Agent UI embedding seam is transport-neutral. Hosts donate **page context** to the Agent UI; trusted auth, organization, and scope data must come from the host's server/auth adapter and must not be accepted from browser page context.

## Package exports

Use `@sonik-agent-ui/agent-embed` for the shared semantic contract:

- `AgentHostPageContext` — sanitized host page context: route, surface, page type, active entity, command families, skill families, and visible actions.
- `AgentHostContextProvider` — native host provider shape for framework adapters.
- `AgentTrustedHostContext` — trusted auth/org/scopes/host-session envelope passed only by server-owned adapter paths.
- `mergeAgentHostPageContext(local, host, trusted?)` — overlays local app state, host page context, and trusted server context.
- `SONIK_AGENT_UI_HOST_MESSAGE_SOURCE` / `SONIK_AGENT_UI_PAGE_CONTEXT_MESSAGE` — stable postMessage envelope constants.
- `isAgentHostPageContextMessage(value)` — runtime guard for iframe transport messages.

## Iframe/postMessage transport

The current standalone reference host uses iframe/postMessage first because it isolates CSS/runtime concerns and keeps the Agent UI easy to embed before native shell integration.

```ts
import {
  SONIK_AGENT_UI_HOST_MESSAGE_SOURCE,
  SONIK_AGENT_UI_PAGE_CONTEXT_MESSAGE,
  type AgentHostPageContext,
} from "@sonik-agent-ui/agent-embed";

const context: AgentHostPageContext = {
  route: "/booking/bookings/booking_123",
  surface: "booking-console",
  pageType: "event-booking-detail",
  activeEntity: { type: "booking", id: "booking_123", label: "Summer Jazz Night" },
  commandFamilies: ["booking", "event"],
  skillFamilies: ["booking-ops"],
  visibleActions: ["viewBooking", "listResources", "assignResource"],
};

iframe.contentWindow?.postMessage(
  {
    source: SONIK_AGENT_UI_HOST_MESSAGE_SOURCE,
    type: SONIK_AGENT_UI_PAGE_CONTEXT_MESSAGE,
    payload: context,
    sentAt: new Date().toISOString(),
  },
  window.location.origin,
);
```

See `apps/standalone-sveltekit/static/fake-booking-host.html` for the local smoke harness.

## Native Svelte API sketch

A native shell can use the same semantics without iframe transport by providing a page-context provider and a trusted context from the server session loader.

```ts
import { mergeAgentHostPageContext, type AgentHostContextProvider, type AgentTrustedHostContext } from "@sonik-agent-ui/agent-embed";

export const providePageContext: AgentHostContextProvider = () => ({
  route: window.location.pathname,
  surface: "campaign-wizard",
  pageType: "wizard",
  activeEntity: { type: "campaign", id: "cmp_123", label: "Summer Launch" },
  commandFamilies: ["campaign"],
  skillFamilies: ["campaign-authoring"],
});

export function createMergedAgentContext(localSnapshot: object, trusted: AgentTrustedHostContext) {
  return mergeAgentHostPageContext(localSnapshot, providePageContext(), trusted);
}
```

## Booking context adapter example

A Sonik booking page should map its route state to page context, then let command indexing load booking/event families. The donated context is **not authorization**; it only guides command relevance and agent grounding.

```ts
const bookingContext = {
  route: `/booking/bookings/${booking.id}`,
  surface: "booking-console",
  pageType: "event-booking-detail",
  activeEntity: { type: "booking", id: booking.id, label: booking.eventName },
  commandFamilies: ["booking", "event"],
  skillFamilies: ["booking-ops"],
  visibleActions: ["viewBooking", "listResources", "assignResource"],
};
```

## Amplify shell context adapter example

An Amplify app shell should derive trusted organization/session state from `$amplify-auth` / `$amplify-org-context` server paths, while client page context stays display/surface-only.

```ts
import { createEmbeddedHostSessionEnvelope, platformAdapterContextFromHostSession } from "@sonik-agent-ui/platform-adapters";
import { mergeAgentHostPageContext, type AgentHostPageContext } from "@sonik-agent-ui/agent-embed";

const amplifyPageContext: AgentHostPageContext = {
  route: "/campaigns/new",
  surface: "amplify-campaign-wizard",
  pageType: "wizard",
  activeEntity: { type: "campaign", id: draftCampaign.id, label: draftCampaign.name },
  commandFamilies: ["campaign", "integration"],
  skillFamilies: ["campaign-authoring"],
};

const hostSession = createEmbeddedHostSessionEnvelope({
  source: "amplify-embedded",
  sessionId: amplifySession.id,
  userId: amplifyUser.id,
  organizationId: amplifyOrg.id,
  authenticated: true,
  scopes: amplifySession.scopes,
});

const trusted = {
  ...platformAdapterContextFromHostSession(hostSession),
  hostSession,
};

const agentContext = mergeAgentHostPageContext(localAgentSnapshot, amplifyPageContext, trusted);
```

Never pass `organizationId`, `authenticated`, `scopes`, tokens, cookies, or API keys through `postMessage` or browser page context. Those belong to trusted host-session adapters only.
