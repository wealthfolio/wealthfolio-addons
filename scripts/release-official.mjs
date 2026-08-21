/**
 * Single release transaction for official addons.
 *
 * Builds the bundles, hashes the exact artifacts that were produced, and emits
 * the catalog INSERT statements for those same bytes. Build once, hash, upload
 * that file, paste the SQL — the digest always describes the artifact that was
 * actually uploaded.
 *
 * This script must never be used to reconstruct a digest for a release that is
 * already published: rebuilding produces different bytes. Hash the object that
 * is already in R2 instead (see the website repo's backfill utility).
 *
 * Usage:
 *   node scripts/release-official.mjs                 # build, then hash + emit SQL
 *   node scripts/release-official.mjs --skip-build    # hash the current dist zips
 *   node scripts/release-official.mjs --only swingfolio-addon
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getAddonRecords, repoRoot, displayName, description } from "./lib/addon-records.mjs";
import { downloadUrl, r2Key } from "./lib/distribution.mjs";

const args = process.argv.slice(2);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/**
 * `--only` with no value used to fall through to "every addon" — the opposite
 * of what the flag asks for, on a script that emits production SQL.
 */
function flagValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value`);
  }
  return value;
}

const KNOWN_FLAGS = new Set(["--skip-build", "--only", "--out"]);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) continue;
  if (!KNOWN_FLAGS.has(arg)) fail(`unknown flag ${arg}`);
  if (arg !== "--skip-build") index += 1;
}

const skipBuild = args.includes("--skip-build");
const only = flagValue("--only");
const outFile = flagValue("--out");

function sqlString(value) {
  if (value === undefined || value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

if (!skipBuild) {
  const filter = only ? `./official/${only}` : "./official/*";
  const result = spawnSync("pnpm", ["-r", "--filter", filter, "bundle"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail("bundle:official failed; nothing was hashed");
  }
}

/**
 * A digest only means something if it describes the right archive. Read the
 * manifest out of the zip and check it against the metadata being published,
 * so a stale or hand-made file cannot become a release row.
 */
function verifyArchive(record, artifactPath, version) {
  const { metadata } = record;
  const label = `${metadata.id}: ${path.relative(repoRoot, artifactPath)}`;

  const listing = spawnSync("unzip", ["-Z1", artifactPath], { encoding: "utf8" });
  if (listing.error || listing.status !== 0) {
    fail(`${label} could not be read as a zip archive`);
  }
  const entries = listing.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);

  if (!entries.includes("manifest.json")) {
    fail(`${label} has no manifest.json at its root`);
  }

  const manifestRead = spawnSync("unzip", ["-p", artifactPath, "manifest.json"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (manifestRead.status !== 0) {
    fail(`${label} manifest.json could not be extracted`);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRead.stdout);
  } catch (error) {
    fail(`${label} manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest.id !== metadata.id) {
    fail(`${label} manifest id is "${manifest.id}", expected "${metadata.id}"`);
  }

  if (manifest.version !== version) {
    fail(`${label} manifest version is "${manifest.version}", expected "${version}"`);
  }

  const entrypoint = manifest.main ?? "dist/addon.js";
  if (!entries.includes(entrypoint)) {
    fail(`${label} does not contain its entrypoint "${entrypoint}"`);
  }
}

const records = (await getAddonRecords())
  .filter((record) => record.metadata.trust === "official")
  .filter((record) => (only ? record.metadata.id === only : true));

if (records.length === 0) {
  fail(only ? `no official addon with id "${only}"` : "no official addons found");
}

const statements = [];

for (const record of records) {
  const { metadata } = record;
  const version = metadata.release?.version;
  if (!version) {
    fail(`${record.relativePath}: release.version is required to publish`);
  }

  // Exactly the name `pnpm bundle` produces. Accepting fallbacks such as
  // <id>.zip invites hashing a stale or unrelated archive and publishing it
  // under a digest that looks authoritative.
  const artifactPath = path.join(record.addonDir, "dist", `${metadata.id}-${version}.zip`);
  if (!existsSync(artifactPath)) {
    fail(
      `${metadata.id}: no built artifact at ${path.relative(repoRoot, artifactPath)}. Run: pnpm bundle:official`,
    );
  }

  verifyArchive(record, artifactPath, version);

  const bytes = await readFile(artifactPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = r2Key(metadata.id, version);
  const url = downloadUrl(metadata.id, version);

  if (metadata.distribution?.r2Path !== key) {
    fail(
      `${record.relativePath}: distribution.r2Path must be "${key}"; run pnpm validate:addons`,
    );
  }

  console.log(`\n${metadata.id} ${version}`);
  console.log(`  artifact : ${path.relative(repoRoot, artifactPath)}`);
  console.log(`  bytes    : ${bytes.length}`);
  console.log(`  sha256   : ${sha256}`);
  console.log(`  r2 key   : ${key}`);
  console.log(`  url      : ${url}`);

  statements.push(
    [
      `-- ${displayName(record)} v${version}`,
      `-- upload: ${path.relative(repoRoot, artifactPath)} -> r2://${key}  (${bytes.length} bytes)`,
      `-- verify: curl -sL ${url} | shasum -a 256   # expect ${sha256}`,
      "INSERT INTO addons (",
      "  id, name, version, description, author, download_url, downloads, rating, review_count,",
      "  tags, status, is_featured, is_critical, has_breaking_changes, release_notes,",
      "  changelog_url, min_wealthfolio_version, sha256, created_at, updated_at",
      ") VALUES (",
      `  ${sqlString(metadata.id)},`,
      `  ${sqlString(displayName(record))},`,
      `  ${sqlString(version)},`,
      `  ${sqlString(description(record))},`,
      "  'Wealthfolio',",
      `  ${sqlString(url)},`,
      "  0, 0, 0,",
      `  ${sqlString(JSON.stringify(metadata.tags ?? []))},`,
      `  ${sqlString(metadata.status)},`,
      `  ${metadata.featured ? 1 : 0}, ${metadata.release.critical ? 1 : 0}, ${metadata.release.breaking ? 1 : 0},`,
      `  ${sqlString(metadata.release.notes)},`,
      `  ${sqlString(metadata.release.changelogUrl)},`,
      `  ${sqlString(metadata.release.minWealthfolioVersion)},`,
      `  ${sqlString(sha256)},`,
      "  CURRENT_TIMESTAMP,",
      "  CURRENT_TIMESTAMP",
      ");",
    ].join("\n"),
  );
}

const header = [
  "-- Generated by scripts/release-official.mjs.",
  "-- The sha256 values describe the exact artifacts listed above; upload those files, not a rebuild.",
  "-- Requires the addons.sha256 column (website repo: db/migrations, addon sha256 migration).",
].join("\n");

const sql = `${header}\n\n${statements.join("\n\n")}\n`;

if (outFile) {
  await writeFile(outFile, sql);
  console.log(`\nWrote ${outFile}`);
} else {
  console.log("\n--- catalog SQL ---\n");
  console.log(sql);
}
