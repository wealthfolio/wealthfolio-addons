# SDK 3.6 Sandbox Migration Guide

Wealthfolio 3.6 moved every addon into a sandboxed iframe (`sandbox="allow-scripts"`,
**without** `allow-same-origin`). This is a security boundary: addon code no longer runs
in the host page's origin. It also changes the runtime contract in ways that break
patterns that worked in ≤3.5. This guide lists every behavioral change, the symptom it
causes in an unmigrated addon, and the required fix.

> **Targeting Wealthfolio 3.6.1+?** Most of the workarounds below are obsolete:
> use `ctx.api.storage` instead of any Web Storage fallback, pass a `component`
> to `router.add` instead of managing a React root, declare static navigation in
> the manifest via `contributes.routes` + `contributes.links`, and drop the `ui`/`query` permission
> blocks (they're implicit baseline capabilities). Set
> `"minWealthfolioVersion": "3.6.1"` and see the host repo's
> `docs/addons/addon-migration-guide-v3.5-to-v3.6.md` for the new APIs. The
> guidance below applies to hosts still on 3.6.0.

## TL;DR checklist (3.6.0 hosts)

- [ ] Use **one** React root for all your routes (or one `render` implementation) — never one `createRoot` per route. (3.6.1+: prefer `component` — the host owns the root.)
- [ ] Remove every direct `localStorage` / `sessionStorage` / `indexedDB` access, or wrap it in try/catch with an in-memory fallback. (3.6.1+: use `ctx.api.storage` — durable, per-addon, survives updates.)
- [ ] Declare every API you call in `manifest.json` `permissions` (including `ui: navigation.navigate`). (3.6.1+: `ui`/`query`/`toast`/`logger`/`storage` are baseline — no declaration needed.)
- [ ] Declare the `secrets` permission if you call `ctx.api.secrets.*` — it works in the sandbox (per-addon scoped), but is unavailable on web deployments running without authentication (3.6.0 only; the 3.6.1 server removes that gate).
- [ ] Test your addon in the real app, clicking through **every** route and every button that persists state.
- [ ] If you target web/server deployments on 3.6.0: addon management, secrets, and the network broker are disabled when the server runs without authentication. (Removed in 3.6.1 — these follow normal auth middleware.)

## What changed

### 1. One DOM container for all routes

**Before (≤3.5):** each registered route received its own container element; caching one
`createRoot` per route worked.

**After (3.6):** the sandbox hands **the same** `#addon-root` element to every route's
`render({ root })`, and re-invokes your renderer on each navigation. React only supports
one root per container. If you create a root per route, the first navigation back to a
previously-rendered route updates an **orphaned** React tree: the screen keeps showing
the old page and every re-render silently goes nowhere.

**Symptom:** navigation buttons "do nothing"; the page freezes on one route while
in-page state (checkboxes, inputs) still works.

**Fix:** keep a single root and swap pages through it:

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

Unmount that single root in your `onDisable` callback.

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

**Fix (3.6.0):** never touch Web Storage directly. Route reads/writes through a helper
that falls back to an in-memory store:

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
app restart. **On 3.6.1+ hosts, skip the fallback entirely and use the durable
per-addon key-value API instead** (baseline capability, no permission needed):

```ts
const stored = await ctx.api.storage.get("my_key");        // string | null
await ctx.api.storage.set("my_key", JSON.stringify(data)); // key ≤128 chars, value ≤1 MiB
await ctx.api.storage.delete("my_key");
```

Values persist in the host database (included in backup/restore), survive addon
updates, and are removed on uninstall.

### 3. Permission manifest is enforced

Every `ctx.api.*` call is checked against the `permissions` array in `manifest.json`.
Undeclared calls throw `AddonPermissionDenied` (the host shows a one-time toast).
Declare everything you use, e.g.:

```json
{
  "category": "ui",
  "functions": ["sidebar.addItem", "router.add", "navigation.navigate", "onDisable"],
  "purpose": "Navigation and routing"
}
```

Note: declaring `ui: router.add` also implicitly grants `navigation.navigate` (legacy
compatibility), but declare it explicitly anyway.

### 4. API calls are async RPC

All `ctx.api.*` calls cross a `postMessage` boundary. Arguments must be
structured-cloneable (no functions, DOM nodes, or class instances). Anything that was
already a Promise stays a Promise; code that relied on synchronous host access must be
made async.

### 5. Anchor clicks are intercepted

Plain `<a href="/internal/route">` clicks inside the sandbox are intercepted and
forwarded to the host router automatically. External-origin links are blocked from
`navigation.navigate` — open them with `target="_blank"` anchors instead.

## Web/server deployments (self-hosted)

When the server runs **without authentication configured**, these endpoints refuse to
operate as a security default (an unauthenticated, network-reachable server would
otherwise let anyone install code):

- Addon install / uninstall / update / enable / disable
  (`"Addon management requires authentication"`)
- Addon secrets API (`"Secrets API requires authentication"`)
- Addon network broker (`"Addon network broker requires authentication"`)

Listing and *running* already-installed addons still works. If you hit these errors on a
private deployment, enable authentication (`WF_AUTH_PASSWORD_HASH` or OIDC). Desktop
builds are not affected.

## Known gaps in 3.6.0 (host-side) — resolved in 3.6.1

These were acknowledged platform gaps in 3.6.0; both are fixed in 3.6.1:

1. **No durable general-purpose addon storage.** ~~Use the in-memory fallback
   pattern.~~ **Fixed in 3.6.1:** `ctx.api.storage` (see above). (`ctx.api.secrets`
   remains available and per-addon scoped, but it is credential storage — OS keyring
   on desktop — not a place for preferences or cached state.)
2. **Sandbox errors surface generically.** ~~Check the developer console.~~
   **Fixed in 3.6.1:** common failures (Web Storage access, unknown host API,
   unavailable route) are classified into actionable toasts and shown inline in the
   route error panel with the addon id.

## Testing your migration

Manual pass, in the real app (not just a bundler build):

1. Install the packaged zip, enable the addon.
2. Visit **every** route; navigate between routes in both directions.
3. Click every control that persists state; verify the UI responds.
4. Disable and re-enable the addon; verify clean unmount/remount.
5. Watch the console for `SecurityError`, `AddonPermissionDenied`, and
   `Unknown addon host API method`.

Reference migration: the Swingfolio addon (`official/swingfolio-addon`) targets
3.6.1 — see its `src/addon.tsx` (`component` routes + `contributes.routes`/`links` +
module-level ctx holder) and `src/hooks/use-swing-preferences.ts`
(`ctx.api.storage` with serialized, execution-time-merged writes).
