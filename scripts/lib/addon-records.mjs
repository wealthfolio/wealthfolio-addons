import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function walk(dir) {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.name === "addon.store.json") {
      files.push(entryPath);
    }
  }

  return files;
}

export async function getAddonRecords() {
  const roots = ["official", "community"].map((name) => path.join(repoRoot, name));
  const files = (await Promise.all(roots.map(walk))).flat().sort();

  return Promise.all(
    files.map(async (filePath) => {
      const metadata = await readJson(filePath);
      const addonDir = path.dirname(filePath);
      const manifestPath = path.join(addonDir, "manifest.json");
      const packagePath = path.join(addonDir, "package.json");

      return {
        filePath,
        relativePath: path.relative(repoRoot, filePath),
        addonDir,
        relativeDir: path.relative(repoRoot, addonDir),
        metadata,
        manifest: existsSync(manifestPath) ? await readJson(manifestPath) : null,
        packageJson: existsSync(packagePath) ? await readJson(packagePath) : null,
      };
    }),
  );
}

export function authorName(author) {
  if (!author) return "";
  return typeof author === "string" ? author : author.name;
}

export function releaseVersion(record) {
  return record.metadata.release?.version ?? record.manifest?.version ?? "";
}

export function displayName(record) {
  return record.metadata.name ?? record.manifest?.name ?? record.metadata.id;
}

export function description(record) {
  return record.metadata.description ?? record.manifest?.description ?? "";
}

/**
 * Only official addons are installable from within Wealthfolio. Community
 * addons are directory listings; their packages are downloaded from the
 * publisher and installed with "Install from File".
 */
export function isInstallable(record) {
  return record.metadata.trust === "official" && record.metadata.status === "active";
}
