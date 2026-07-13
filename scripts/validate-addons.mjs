import path from "node:path";
import { existsSync } from "node:fs";
import { getAddonRecords, repoRoot } from "./lib/addon-records.mjs";

const records = await getAddonRecords();
const ids = new Map();
const errors = [];
const warnings = [];

function requireField(record, field) {
  if (record.metadata[field] === undefined || record.metadata[field] === "") {
    errors.push(`${record.relativePath}: missing required field "${field}"`);
  }
}

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

for (const record of records) {
  const { metadata, manifest, packageJson } = record;

  for (const field of ["id", "trust", "verification", "status", "tags"]) {
    requireField(record, field);
  }

  if (ids.has(metadata.id)) {
    errors.push(`${record.relativePath}: duplicate id "${metadata.id}" also used by ${ids.get(metadata.id)}`);
  } else {
    ids.set(metadata.id, record.relativePath);
  }

  if (!["official", "community"].includes(metadata.trust)) {
    errors.push(`${record.relativePath}: trust must be official or community`);
  }

  if (!["verified", "unverified"].includes(metadata.verification)) {
    errors.push(`${record.relativePath}: verification must be verified or unverified`);
  }

  if (!["active", "coming-soon", "deprecated", "inactive"].includes(metadata.status)) {
    errors.push(`${record.relativePath}: unsupported status "${metadata.status}"`);
  }

  if (!Array.isArray(metadata.tags)) {
    errors.push(`${record.relativePath}: tags must be an array`);
  }

  if (metadata.trust === "community") {
    for (const field of ["name", "description", "author", "repository"]) {
      requireField(record, field);
    }
  }

  if (metadata.verification === "verified") {
    for (const field of ["release", "distribution", "media"]) {
      requireField(record, field);
    }
  }

  if (metadata.trust === "official") {
    if (!manifest) {
      errors.push(`${record.relativePath}: official addons must include manifest.json`);
    }

    if (!packageJson) {
      errors.push(`${record.relativePath}: official addons must include package.json`);
    }
  }

  if (manifest) {
    if (manifest.id !== metadata.id) {
      errors.push(`${record.relativePath}: manifest id "${manifest.id}" does not match store id "${metadata.id}"`);
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

  for (const imagePath of Object.values(metadata.media ?? {})) {
    if (!existsSync(path.join(record.addonDir, imagePath))) {
      warnings.push(`${record.relativePath}: media file is not present yet: ${imagePath}`);
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
