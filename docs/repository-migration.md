# Repository Migration

Wealthfolio addon source moved out of the app repository into this repository.
Use this guide when updating old PRs, moving existing addons, or creating new
addon submissions.

## What Moved

| Old location in `wealthfolio/wealthfolio`                 | New location in `wealthfolio-addons`                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `addons/<addon-id>/` official addon source                | `official/<addon-id>/`                                                        |
| `addons/community-addons.md`                              | `community/directory/*/addon.store.json` plus generated `community/README.md` |
| Root scripts `pnpm build:addons` and `pnpm bundle:addons` | `pnpm build:official` and `pnpm bundle:official`                              |
| Ad hoc store SQL snippets                                 | Internal catalog/store release pipeline                                       |

## What Stayed In The App Repo

- Addon runtime and host integration: `apps/frontend/src/addons`
- Addon SDK package: `packages/addon-sdk`
- Addon dev tools package: `packages/addon-dev-tools`
- Shared UI package: `packages/ui`
- Developer documentation source: `docs/addons`

The public catalog, store database, download counts, ratings, and review counts
remain outside this repo. Do not add database rows or dynamic store metrics here.

## Migrating An Official Addon

1. Move source from `addons/<addon-id>` to `official/<addon-id>`.
2. Add or update `addon.store.json` from
   `templates/official-addon/addon.store.json`.
3. Replace `workspace:*` dependencies with published npm package ranges:
   `@wealthfolio/addon-sdk`, `@wealthfolio/addon-dev-tools`, and
   `@wealthfolio/ui`.
4. Keep `manifest.json`, `package.json`, and `CHANGELOG.md` versions aligned.
5. Add wide landscape light and dark screenshots under `media/` — not
   `assets/`, which is bundled into the shipped addon — and reference them from
   `addon.store.json`.
6. Run `pnpm validate:addons`, `pnpm type-check:official`, and
   `pnpm bundle:official`.

## Migrating A Community Addon PR

Community addons are directory listings. Create one file:

```text
community/directory/<addon-id>/addon.store.json
```

Wealthfolio does not build or host community artifacts, so there is no pinned
source, no `distribution` block, and no screenshots to submit.

The listing itself is short: a public GitHub repository, the publisher, a plain
description, tags, and `commercialModel`. Licence, data handling, compatibility,
last activity, and the standard notices are **derived** from the publisher's
repository into `community/derived.json` — do not declare them.

A listing cannot be published until its repository carries a licence and its
manifest declares `sdkVersion` 3.6 or newer. Before 3.6 an addon could reach the
network without declaring it, so its manifest cannot show where data goes, and
declaring `dataHandling` is not an alternative to rebuilding. See
[POLICIES.md](../POLICIES.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

The earlier Verified Community tier has been removed. A PR that targeted
`community/verified/` becomes a directory listing: drop `verification`,
`distribution`, `media`, `source`, and `release`, and add the publisher
disclosures.

## Command Mapping

| Old command                          | New command                                       |
| ------------------------------------ | ------------------------------------------------- |
| `pnpm build:addons` in the app repo  | `pnpm build:official` in this repo                |
| `pnpm bundle:addons` in the app repo | `pnpm bundle:official` in this repo               |
| Manual community README edits        | Edit `addon.store.json`, then run `pnpm generate` |
| Manual metadata review only          | `pnpm validate:addons`                            |
| Reading a publisher's repo by hand   | `pnpm derive:community`                           |

## API Migration

If an addon still uses older Wealthfolio addon APIs, migrate it using the app
repo guide:
[Addon migration guide v2 to v3](https://github.com/wealthfolio/wealthfolio/blob/main/docs/addons/addon-migration-guide-v2-to-v3.md).

Keep API compatibility in sync with `manifest.json`:

- `version`: addon release version
- `sdkVersion`: Wealthfolio addon SDK version used by the addon
- `minWealthfolioVersion`: minimum Wealthfolio app version required by the
  store metadata

## Screenshot Migration

Repo-local screenshot files are referenced from `addon.store.json` as:

```text
media/cover-light.webp
media/cover-dark.webp
```

Official covers live under `media/`, not `assets/`: the package script bundles
`assets/` into the shipped addon, and storefront art has no business inside a
user's install.

The catalog site expects CDN screenshots under version-less names, so a release
never orphans a listing's screenshot:

```text
https://assets.wealthfolio.app/images/addons/<addon-id>.webp
https://assets.wealthfolio.app/images/addons/<addon-id>-dark.webp
```

Upload the repo-local cover under the version-less name. Re-upload only when
the addon's interface actually changes — not on every release, which is what
orphaned every official screenshot when the addons moved to 3.6.
