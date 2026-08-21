import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { getAddonRecords, readJson, repoRoot } from "./lib/addon-records.mjs";
import { createStoreValidator, formatSchemaErrors } from "./lib/schema.mjs";
import { inspectImage } from "./lib/images.mjs";
import { downloadUrl, r2Key } from "./lib/distribution.mjs";
import { requiredNotices } from "./lib/notices.mjs";
import { blockingProblems } from "./lib/derive.mjs";

const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const MIN_MEDIA_WIDTH = 800;
const ALLOWED_MEDIA_EXTENSIONS = new Map([
  [".webp", "webp"],
  [".png", "png"],
]);

const records = await getAddonRecords();
const validateStore = await createStoreValidator();

// Derived facts are read from the committed file, never fetched here: metadata
// validation must work offline and must not depend on third-party repositories
// being reachable. Refresh the file with `pnpm derive:community`.
const derivedPath = path.join(repoRoot, "community/derived.json");
const derived = existsSync(derivedPath)
  ? (await readJson(derivedPath)).addons ?? {}
  : {};
const ids = new Map();
const errors = [];
const warnings = [];

function validateContributedRoutes(record, manifest) {
  const routes = manifest.contributes?.routes;
  if (routes === undefined) {
    return;
  }

  const routePaths = new Set();
  if (!Array.isArray(routes)) {
    errors.push(`${record.relativePath}: manifest contributes.routes must be an array`);
    return;
  }

  routes.forEach((route, index) => {
    const prefix = `${record.relativePath}: manifest contributes.routes[${index}]`;
    if (!route || typeof route !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }

    const routePath = route.path ?? "";
    if (typeof routePath !== "string") {
      errors.push(`${prefix}.path must be a string when present`);
      return;
    }

    const hasUnsafeSegment =
      routePath !== "" &&
      routePath.split("/").some((segment) => !segment || segment === "." || segment === "..");
    if (
      routePath !== routePath.trim() ||
      routePath.startsWith("/") ||
      /[\\?#%]/.test(routePath) ||
      hasUnsafeSegment
    ) {
      errors.push(
        `${prefix}.path must be relative to /addons/<addon-id> without traversal, escapes, queries, or fragments`,
      );
    }

    const normalizedPath = routePath.toLowerCase();
    if (routePaths.has(normalizedPath)) {
      errors.push(`${prefix}.path duplicates route path "${routePath}"`);
    }
    routePaths.add(normalizedPath);
  });
}

function validateDistribution(record) {
  const { metadata } = record;
  const version = metadata.release?.version;
  if (!version || !metadata.distribution) {
    return;
  }

  const expectedKey = r2Key(metadata.id, version);
  if (metadata.distribution.r2Path !== expectedKey) {
    errors.push(
      `${record.relativePath}: distribution.r2Path must be "${expectedKey}" (derived from id and release version), got "${metadata.distribution.r2Path}"`,
    );
  }

  const expectedUrl = downloadUrl(metadata.id, version);
  if (metadata.distribution.downloadUrl && metadata.distribution.downloadUrl !== expectedUrl) {
    errors.push(
      `${record.relativePath}: distribution.downloadUrl must be "${expectedUrl}", got "${metadata.distribution.downloadUrl}"`,
    );
  }
}

/**
 * A community listing goes public on facts Wealthfolio verified, so it cannot
 * be `active` until those facts exist and are clean.
 */
function validateDerived(record) {
  const { metadata } = record;
  if (metadata.trust !== "community") return;

  const entry = derived[metadata.id];
  const prefix = `${record.relativePath}`;

  if (!entry) {
    if (metadata.status === "active") {
      errors.push(
        `${prefix}: no derived record; run pnpm derive:community before publishing this listing`,
      );
    }
    return;
  }

  if (entry.repository !== metadata.repository) {
    errors.push(
      `${prefix}: derived record is stale (repository changed); run pnpm derive:community`,
    );
    return;
  }

  // Notices come from tags, which live in this repository — so unlike the rest
  // of the derived record they can go stale without anything remote changing.
  // Recomputing them offline keeps a retagged listing from publishing without
  // the notice its category requires.
  const expectedNotices = requiredNotices(metadata.tags).join(",");
  if ((entry.notices ?? []).join(",") !== expectedNotices) {
    errors.push(
      `${prefix}: derived notices are stale for the current tags; run pnpm derive:community`,
    );
    return;
  }

  const blocking = blockingProblems(entry);
  if (metadata.status === "active" && blocking.length) {
    for (const problem of blocking) {
      errors.push(`${prefix}: cannot publish — ${problem}`);
    }
  }

  for (const warning of entry.warnings ?? []) {
    warnings.push(`${prefix}: ${warning}`);
  }

  if (metadata.status === "active" && entry.compatibility?.state === "predates-sandbox") {
    warnings.push(`${prefix}: ${entry.compatibility.detail}`);
  }
}

function validateMedia(record) {
  const { metadata } = record;
  const isOfficial = metadata.trust === "official";

  for (const [field, imagePath] of Object.entries(metadata.media ?? {})) {
    const prefix = `${record.relativePath}: media.${field}`;

    if (path.isAbsolute(imagePath) || imagePath.split("/").includes("..")) {
      errors.push(`${prefix} must be a path inside the addon directory`);
      continue;
    }

    const extension = path.extname(imagePath).toLowerCase();
    const expectedFormat = ALLOWED_MEDIA_EXTENSIONS.get(extension);
    if (!expectedFormat) {
      errors.push(`${prefix} must be a .webp or .png file, got "${extension || imagePath}"`);
      continue;
    }

    const absolutePath = path.join(record.addonDir, imagePath);
    if (!existsSync(absolutePath)) {
      // The catalog renders official covers, so a declared-but-absent file is a
      // broken listing, not a nice-to-have.
      const message = `${prefix} file is missing: ${imagePath}`;
      if (isOfficial) errors.push(message);
      else warnings.push(`${prefix} file is not present yet: ${imagePath}`);
      continue;
    }

    if (statSync(absolutePath).size > MAX_MEDIA_BYTES) {
      errors.push(`${prefix} exceeds ${MAX_MEDIA_BYTES / 1024 / 1024} MiB`);
      continue;
    }

    // An extension is a claim; check the bytes.
    const image = inspectImage(absolutePath);
    if (!image) {
      errors.push(`${prefix} is not a valid PNG or WebP image`);
      continue;
    }

    if (image.format !== expectedFormat) {
      errors.push(
        `${prefix} is a ${image.format} image but is named .${expectedFormat}`,
      );
      continue;
    }

    if (!image.width || !image.height) {
      errors.push(`${prefix} has unreadable dimensions`);
      continue;
    }

    if (image.width < MIN_MEDIA_WIDTH) {
      errors.push(
        `${prefix} is ${image.width}x${image.height}; covers must be at least ${MIN_MEDIA_WIDTH}px wide`,
      );
      continue;
    }

    if (image.height > image.width) {
      warnings.push(
        `${prefix} is portrait (${image.width}x${image.height}); covers are displayed in a landscape frame`,
      );
    }
  }
}

function collectUrls(metadata) {
  const found = [];
  const add = (label, value) => {
    if (typeof value === "string") found.push([label, value]);
  };

  add("repository", metadata.repository);
  add("supportUrl", metadata.supportUrl);
  add("privacyUrl", metadata.privacyUrl);
  if (metadata.author && typeof metadata.author === "object") add("author.url", metadata.author.url);
  add("source.repository", metadata.source?.repository);
  add("release.changelogUrl", metadata.release?.changelogUrl);
  add("distribution.downloadUrl", metadata.distribution?.downloadUrl);
  (metadata.dataHandling?.externalServices ?? []).forEach((service, index) => {
    add(`dataHandling.externalServices[${index}].url`, service?.url);
  });

  return found;
}

/**
 * The schema pattern is a coarse gate. Parse every URL properly as well, so a
 * string that merely looks acceptable cannot smuggle credentials or a
 * non-HTTPS scheme into a page users click.
 */
function validateUrls(record) {
  for (const [label, value] of collectUrls(record.metadata)) {
    const prefix = `${record.relativePath}: ${label}`;
    let url;

    try {
      url = new URL(value);
    } catch {
      errors.push(`${prefix} is not a valid URL: "${value}"`);
      continue;
    }

    if (url.protocol !== "https:") {
      errors.push(`${prefix} must use https, got "${url.protocol}"`);
      continue;
    }

    if (url.username || url.password) {
      errors.push(`${prefix} must not embed credentials`);
      continue;
    }

    if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
      errors.push(`${prefix} has a suspicious hostname: "${url.hostname}"`);
    }
  }
}

function validateBranding(record) {
  const { metadata } = record;
  if (metadata.trust !== "community") {
    return;
  }

  const name = metadata.name ?? "";
  if (/^wealthfolio\b/i.test(name)) {
    warnings.push(
      `${record.relativePath}: community addon name starts with "Wealthfolio"; confirm it does not imply an official addon (see TRADEMARKS policy)`,
    );
  }
}

for (const record of records) {
  const { metadata, manifest, packageJson } = record;

  if (!validateStore(metadata)) {
    errors.push(...formatSchemaErrors(record.relativePath, validateStore.errors));
  }

  if (ids.has(metadata.id)) {
    errors.push(
      `${record.relativePath}: duplicate id "${metadata.id}" also used by ${ids.get(metadata.id)}`,
    );
  } else {
    ids.set(metadata.id, record.relativePath);
  }

  const expectedDir = metadata.trust === "official" ? "official" : "community/directory";
  if (!record.relativeDir.startsWith(`${expectedDir}/`)) {
    errors.push(`${record.relativePath}: ${metadata.trust} addons must live under ${expectedDir}/`);
  }

  if (path.basename(record.addonDir) !== metadata.id) {
    errors.push(
      `${record.relativePath}: directory name must match the addon id "${metadata.id}"`,
    );
  }

  if (metadata.trust === "official") {
    if (!manifest) {
      errors.push(`${record.relativePath}: official addons must include manifest.json`);
    }

    if (!packageJson) {
      errors.push(`${record.relativePath}: official addons must include package.json`);
    }
  }

  validateDistribution(record);
  validateUrls(record);
  validateDerived(record);
  validateMedia(record);
  validateBranding(record);

  if (manifest) {
    if (manifest.id !== metadata.id) {
      errors.push(
        `${record.relativePath}: manifest id "${manifest.id}" does not match store id "${metadata.id}"`,
      );
    }

    if (metadata.release?.version && manifest.version !== metadata.release.version) {
      errors.push(
        `${record.relativePath}: manifest version "${manifest.version}" does not match release version "${metadata.release.version}"`,
      );
    }

    if (metadata.release?.sdkVersion && manifest.sdkVersion !== metadata.release.sdkVersion) {
      errors.push(
        `${record.relativePath}: manifest sdkVersion "${manifest.sdkVersion}" does not match release sdkVersion "${metadata.release.sdkVersion}"`,
      );
    }

    if (
      metadata.release?.minWealthfolioVersion &&
      manifest.minWealthfolioVersion !== metadata.release.minWealthfolioVersion
    ) {
      errors.push(
        `${record.relativePath}: manifest minWealthfolioVersion "${manifest.minWealthfolioVersion}" does not match release minWealthfolioVersion "${metadata.release.minWealthfolioVersion}"`,
      );
    }

    validateContributedRoutes(record, manifest);
  }

  if (packageJson) {
    if (manifest?.version && packageJson.version !== manifest.version) {
      errors.push(
        `${record.relativePath}: package version "${packageJson.version}" does not match manifest version "${manifest.version}"`,
      );
    }

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    for (const [name, version] of Object.entries(allDeps)) {
      if (version === "workspace:*") {
        errors.push(`${record.relativePath}: ${name} still uses workspace:*`);
      }
    }
  }
}

if (warnings.length) {
  console.warn(warnings.map((warning) => `warning: ${warning}`).join("\n"));
}

if (errors.length) {
  console.error(errors.map((error) => `error: ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${records.length} addon records in ${repoRoot}`);
