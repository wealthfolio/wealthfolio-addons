# SDK 3.6 Sandbox Migration Guide

Wealthfolio 3.6 moved every addon into a sandboxed iframe (`sandbox="allow-scripts"`,
**without** `allow-same-origin`). This is a security boundary: addon code no longer runs
in the host page's origin. It also changes the runtime contract in ways that break
patterns that worked in ≤3.5. This guide lists every behavioral change, the symptom it
causes in an unmigrated addon, and the required fix.

> **Version note.** The current published baseline is **3.6.2** (SDK `package.json` and
> the `v3.6.2` git tag). Everything earlier drafts of this guide hedged as "current host
> source" — `ctx.api.storage`, host-managed `component` routes, declarative
> `contributes.routes` + `contributes.links`, and baseline
> `ui`/`query`/`toast`/`logger`/`storage` capabilities — is now shipped and tagged in
> 3.6.2. (The SDK `CHANGELOG.md` is stale: its top entry is still `3.6.1`; do not rely on
> it to describe 3.6.2.) Sections below target 3.6.2. Where an addon must **also** run on
> an older 3.6.0/3.6.1 host, the compatible fallbacks are called out inline.

## TL;DR checklist (3.6.2)

- [ ] Declare your pages and sidebar entries in `manifest.json` **`contributes.routes` /
      `contributes.links`** (lazy activation — the host knows them before the addon boots),
      and register matching **`component` routes** at runtime with the same `id`. The host
      owns a single React root and swaps the component on navigation. Use the manual
      single-root `render` pattern only as a legacy escape hatch or for 3.6.0/3.6.1
      back-compat. Never create one `createRoot` per route.
- [ ] Remove every direct `localStorage` / `sessionStorage` / `indexedDB` access. Use the
      durable, per-addon `ctx.api.storage` API. (Keep the in-memory fallback below only if
      you must also support 3.6.0/3.6.1 hosts, which lack `ctx.api.storage`.)
- [ ] Declare every **non-baseline** API you call in `manifest.json` `permissions`. The
      baseline capabilities `ui`, `query`, `toast`, `logger`, `storage` need **no**
      declaration and never appear in the consent UI.
- [ ] Declare the `secrets` permission if you call `ctx.api.secrets.*`, and the `network`
      permission if you call `ctx.api.network.request()`.
- [ ] Test your addon in the real app, clicking through **every** route and every button
      that persists state.
- [ ] If you deploy to self-hosted **web/server**, read the auth section below — with
      authentication configured, *every* host API an addon calls runs behind the user's
      session.

## What changed

### 1. One React root — prefer host-managed `component` routes

**Before (≤3.5):** each registered route received its own container element; caching one
`createRoot` per route worked.

**After (3.6):** the sandbox hands **the same** `#addon-root` element to every route and
re-invokes your renderer on each navigation. React only supports one root per container.
If you create a root per route, the first navigation back to a previously-rendered route
updates an **orphaned** React tree: the screen keeps showing the old page and every
re-render silently goes nowhere.

**Symptom:** navigation buttons "do nothing"; the page freezes on one route while
in-page state (checkboxes, inputs) still works.

**Fix (3.6.2, recommended): declare pages in the manifest, register `component` routes at
runtime.** This is the pattern the host is built around — adopt both halves.

**1. Declare routes and sidebar links in `manifest.json` `contributes`.** The host ingests
these at boot **without executing addon code**, so the route resolves and the sidebar entry
appears before (and independently of) the addon's runtime activation — this is the
lazy-activation surface. Prefer declarative `contributes.links` over the imperative
`ctx.sidebar.addItem` for exactly that reason.

```json
{
  "contributes": {
    "routes": [
      { "id": "main" },
      { "id": "settings", "path": "settings" }
    ],
    "links": {
      "sidebar": [
        { "id": "main", "route": "main", "label": "My Addon", "icon": "wallet", "order": 150 }
      ]
    }
  }
}
```

The host mounts the root route at `/addons/<manifest.id>`; nested pages take a **relative**
`path` suffix (e.g. `"reports/:year"`) — absolute paths, traversal, query strings, and
fragments are rejected. A route with no link is legal (deep-link only). `icon` must be a
curated `AddonIconName` (unknown names fall back to `caret-right`).

**2. Register a `component` route at runtime, with the same `id`.** The host owns a single
React root and swaps the mounted component itself, so the "buttons do nothing" bug can't
happen. The component receives the current `location` as a prop (the sandbox has no
react-router provider, so `useLocation()`/`useParams()` throw):

```tsx
context.router.add({
  id: "main", // MUST equal the contributes.routes[].id
  component: ({ location }) => <DashboardPage ctx={context} location={location} />,
});
```

The runtime `id` **must equal** the declared `contributes.routes[].id` — a mismatch renders
a blank "route is not available" page. `RouteConfig` accepts **exactly one** of `component`
(preferred — host manages the root, no `createRoot`, no route unmount in `onDisable`) or
`render` (the imperative callback given the container element). If both are provided,
`component` wins; if neither, the host rejects the route.

**Legacy / back-compat fix (`render`):** if you use `render` — because you need imperative
control, or must support 3.6.0/3.6.1 hosts where `component` did not exist — keep a single
root and swap pages through it, and unmount it in `onDisable`:

```tsx
let appRoot: Root | undefined;
let appContainer: HTMLElement | undefined;

function renderPage(root: HTMLElement, page: ReactNode) {
  if (!appRoot || appContainer !== root) {
    appRoot?.unmount();
    appRoot = createRoot(root);
    appContainer = root;
  }
  appRoot.render(page);
}

context.router.add({ id: "main", path: "/addons/my-addon",
  render: ({ root }) => renderPage(root, <DashboardPage ctx={context} />) });
context.router.add({ id: "settings", path: "/addons/my-addon/settings",
  render: ({ root }) => renderPage(root, <SettingsPage ctx={context} />) });
```

The declarative `contributes` manifest above works with `render` routes too — the
id-match rule is the same.

### 2. Web Storage throws (opaque origin)

The sandbox omits `allow-same-origin`, so the addon document has an *opaque origin*.
Any access to `localStorage`, `sessionStorage`, `document.cookie`, or `indexedDB` throws:

```
SecurityError: Failed to read the 'localStorage' property from 'Window':
The document is sandboxed and lacks the 'allow-same-origin' flag.
```

**Symptoms, by where the access happens:**

| Access location | Result |
| --- | --- |
| Module top level / first render, unguarded | Uncaught exception → the addon shows the error state or a blank screen |
| Event handler / mutation, unguarded | The handler dies mid-flight → button appears dead, no visible feedback |
| Wrapped in try/catch | Reads fall back to defaults; writes are lost |

**Fix (3.6.2):** never touch Web Storage directly. Use the durable, per-addon key-value
API (a **baseline** capability — no permission needed):

```ts
const stored = await ctx.api.storage.get("my_key");        // string | null
await ctx.api.storage.set("my_key", JSON.stringify(data));
await ctx.api.storage.delete("my_key");
```

Limits, enforced host-side:

- **Keys** ≤ 128 characters, from the charset `[A-Za-z0-9_.:-]` (empty, over-length, or
  out-of-charset keys are rejected).
- **Values** are bounded by the serialized `{addon_id, key, value}` sync payload, capped
  at **250,000 bytes (~244 KiB)**; `set()` rejects an oversized value with
  `"…too large to sync across devices"`. Use many small keys, not one large blob, and keep
  device-local caches out of storage.

Values persist in the host database (included in backup/restore), **replicate across a
user's paired devices** via device-sync, survive addon updates, and are removed on
uninstall.

**Back-compat (3.6.0/3.6.1 hosts have no `ctx.api.storage`):** route reads/writes through a
helper that falls back to an in-memory store, so the UI keeps working even where durable
storage is unavailable:

```ts
const memory = new Map<string, string>();

function readItem(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* opaque origin */ }
  return memory.get(key) ?? null;
}

function writeItem(key: string, value: string): void {
  memory.set(key, value);           // never throws — UI keeps working
  try { window.localStorage.setItem(key, value); } catch { /* opaque origin */ }
}
```

In-memory state survives route navigation (the sandbox iframe stays loaded) but not an
app restart. (`ctx.api.secrets` remains available and per-addon scoped, but it is
credential storage — OS keyring on desktop — not a place for preferences or cached state.)

### 3. Permission manifest is enforced

Every **non-baseline** `ctx.api.*` call is checked against the `permissions` array in
`manifest.json`. Undeclared calls throw `AddonPermissionDenied` (the host shows a one-time
toast).

**Baseline capabilities** — `ui`, `query`, `toast`, `logger`, `storage` — need **no**
declaration: they are never surfaced in consent UI, never runtime-guarded, and never count
as a permission escalation on update. (Legacy manifests that still declare them keep
parsing; the declaration is simply ignored.)

Everything else must be declared. Declare the actual data/capability category you call —
e.g. reading holdings and valuations is the `portfolio` category (a high-risk permission),
not `ui`:

```json
{
  "category": "portfolio",
  "functions": ["getHoldings", "getHolding", "getHistoricalValuations"],
  "purpose": "Read holdings and valuations to render the dashboard"
}
```

Non-baseline categories include `accounts`, `portfolio`, `activities`, `market-data`,
`assets`, `quotes`, `performance`, `currency`, `financial-planning`,
`contribution-limits`, `settings`, `files`, `secrets`, `snapshots`, `events`, and
`network`. Installation also runs static analysis to detect API calls, so declare what you
actually use.

### 4. API calls are async RPC

All `ctx.api.*` calls cross a `postMessage` boundary. Arguments must be
structured-cloneable (no functions, DOM nodes, or class instances). Anything that was
already a Promise stays a Promise; code that relied on synchronous host access must be
made async.

### 5. Anchor clicks are intercepted

Same-origin `<a href="/internal/route">` clicks inside the sandbox are intercepted and
forwarded to the host router (`navigation.navigate`) automatically. Anchors with
`download`, or with a `target` other than `_self`, are left alone; cross-origin hrefs are
not converted and follow normal anchor behavior. `navigation.navigate` itself blocks
external-origin routes — open external links with `target="_blank"` anchors instead.

## Web/server deployments (self-hosted)

Authentication only exists in the self-hosted **web server** (`apps/server`). The desktop
(Tauri) build has no auth layer and is unaffected by everything in this section.

**Fail-closed startup.** The server refuses to start when it binds a non-loopback address
without authentication configured, unless you explicitly opt out with
`WF_AUTH_REQUIRED=false` (for setups where a reverse proxy handles auth):

```
Refusing to start: listening on non-loopback address … without authentication.
```

If MCP is enabled (`WF_MCP_ENABLED=true`), the same off-loopback-without-auth check applies
with **no** `WF_AUTH_REQUIRED` escape hatch (the agent-access API mints Personal Access
Tokens). Configure auth with `WF_AUTH_PASSWORD_HASH` (Argon2id) or OIDC.

**When authentication is configured, the entire `/api/v1` surface is JWT-gated.** A single
middleware wraps *every* feature router, so **every host API an addon calls runs behind the
user's session** — the data reads (`accounts`, `portfolio`, `activities`, `market`, …),
`secrets`, the network broker, addon management, and the `storage` API. Requests without a
valid session (cookie `wf_session` or `Authorization: Bearer …`) get `401 Unauthorized`.
Addons run inside the host page's authenticated session and inherit the cookie
automatically — there is nothing addon-side to pass — but calls will fail if the session
expires, so handle host-API errors gracefully.

**Change from 3.6.0/3.6.1.** Those releases *additionally* hard-disabled three endpoint
groups whenever the server ran **without** auth configured — addon management, the secrets
API, and the addon network broker each returned a dedicated error
(`"Addon management requires authentication"`, `"Secrets API requires authentication"`,
`"Addon network broker requires authentication"`). **3.6.2 removed those per-endpoint
guards.** On an open (loopback or `WF_AUTH_REQUIRED=false`) server they now operate like
any other endpoint, governed solely by the blanket middleware above — so those specific
error strings no longer exist. Listing and running installed addons was never gated by
those guards. If you relied on the old per-endpoint refusals as a safety net on an
unauthenticated deployment, note they are gone: enable authentication
(`WF_AUTH_PASSWORD_HASH` or OIDC) to protect the whole surface.

## Error surfacing

Common sandbox failures — Web Storage access, unknown host API, unavailable route,
permission denial — are classified into actionable toasts and shown inline in the route
error panel with the addon id (host source in
`apps/frontend/src/addons/iframe/addon-iframe-manager.ts`). For anything else, check the
developer console.

## Testing your migration

Manual pass, in the real app (not just a bundler build):

1. Install the packaged zip, enable the addon.
2. Visit **every** route; navigate between routes in both directions.
3. Click every control that persists state; verify the UI responds and reloads after an
   app restart (durable `ctx.api.storage`).
4. Disable and re-enable the addon; verify clean unmount/remount.
5. Watch the console for `SecurityError`, `AddonPermissionDenied`, and
   `Unknown addon host API method`.

Reference migration: the Swingfolio addon (`official/swingfolio-addon`) targets
3.6.1+ — see its `src/addon.tsx` (one shared React root across `render` routes +
`contributes.routes`/`links`) and `src/hooks/use-swing-preferences.ts`
(durable host storage when available, with serialized, execution-time-merged
writes and a session fallback).
