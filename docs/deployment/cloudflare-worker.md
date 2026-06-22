# Cloudflare Worker deployment

The standalone Agent UI deploys as a SvelteKit app on Cloudflare Workers Static Assets via `@sveltejs/adapter-cloudflare`.

## Fast staging allowlist

For temporary Worker-hosted staging URLs, keep iframe/page-context friction low with wildcard host-origin patterns:

```jsonc
{
  "vars": {
    "PUBLIC_AGENT_UI_ALLOWED_HOST_ORIGINS": "https://*.workers.dev,https://*.sonik.fm"
  }
}
```

This allows browser page-context donation from hosts such as:

- `https://amplify-staging.liam-trampota.workers.dev`
- `https://sonik-booking-app.liam-trampota.workers.dev`
- future `https://*.sonik.fm` hosts

Use `*` only for short-lived throwaway demos. The iframe still posts page context to the exact Agent UI origin; the wildcard controls which host origins the Agent UI accepts page-context messages from.

## Required Worker config

`apps/standalone-sveltekit/wrangler.jsonc` contains the default staging-safe Worker config:

```jsonc
{
  "name": "sonik-agent-ui",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": ".svelte-kit/cloudflare"
  },
  "vars": {
    "PUBLIC_AGENT_UI_ALLOWED_HOST_ORIGINS": "https://*.workers.dev,https://*.sonik.fm"
  }
}
```

## Host env

Amplify/Booking should point at the deployed Agent UI URL and allow the Agent UI origin. For a temporary Worker URL:

```bash
VITE_SONIK_AGENT_UI_URL=https://sonik-agent-ui.<account>.workers.dev/
VITE_SONIK_AGENT_UI_ALLOWED_ORIGINS=https://*.workers.dev,https://*.sonik.fm
```

For the stable hosted domain:

```bash
VITE_SONIK_AGENT_UI_URL=https://agent-ui.sonik.fm/
VITE_SONIK_AGENT_UI_ALLOWED_ORIGINS=https://*.workers.dev,https://*.sonik.fm
```

## Deploy

```bash
pnpm --filter svelte-chat build
cd apps/standalone-sveltekit
pnpm exec wrangler deploy
```

## Security boundary

The wildcard allowlist is only for browser page context (`route`, `surface`, `title`, visible commands). It is not an auth channel. Production privileged tools should use a host-side proxy or short-lived host-minted token.
