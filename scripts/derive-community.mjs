/**
 * Refreshes community/derived.json — the verifiable half of every community
 * listing.
 *
 * Publishers declare only what cannot be checked (what the addon costs).
 * Everything else — licence, data handling, compatibility, liveness — is read
 * from their repository here, recorded with the commit it came from, and
 * displayed as derived rather than declared.
 *
 * The output is committed so that validation, the generated tables, and the
 * website build are all reproducible and reviewable, with exactly one place
 * that touches the network.
 *
 * Usage:
 *   node scripts/derive-community.mjs
 *   node scripts/derive-community.mjs --only value-averaging-addon
 *   node scripts/derive-community.mjs --check    # fail if the file is stale
 */
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getAddonRecords, readJson, repoRoot } from "./lib/addon-records.mjs";
import { blockingProblems, deriveListing } from "./lib/derive.mjs";

const args = process.argv.slice(2);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const KNOWN_FLAGS = new Set(["--check", "--only"]);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) continue;
  if (!KNOWN_FLAGS.has(arg)) fail(`unknown flag ${arg}`);
  if (arg === "--only") index += 1;
}

const checkOnly = args.includes("--check");
const onlyIndex = args.indexOf("--only");
if (onlyIndex !== -1 && (!args[onlyIndex + 1] || args[onlyIndex + 1].startsWith("--"))) {
  fail("--only requires a value");
}
const only = onlyIndex === -1 ? null : args[onlyIndex + 1];

export const derivedPath = path.join(repoRoot, "community/derived.json");

const records = (await getAddonRecords())
  .filter((record) => record.metadata.trust === "community")
  .filter((record) => (only ? record.metadata.id === only : true));

if (only && !records.length) {
  fail(`no community listing with id "${only}"`);
}

const previous = existsSync(derivedPath) ? await readJson(derivedPath) : { addons: {} };
const addons = only ? { ...previous.addons } : {};

for (const record of records) {
  process.stderr.write(`deriving ${record.metadata.id} ... `);
  try {
    const derived = await deriveListing(record.metadata);
    addons[record.metadata.id] = derived;
    const blocking = blockingProblems(derived);
    process.stderr.write(
      blocking.length ? `blocked: ${blocking.join("; ")}\n` : `ok (${derived.license})\n`,
    );
  } catch (error) {
    process.stderr.write(`failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const sortedAddons = Object.fromEntries(
  Object.keys(addons).sort().map((id) => [id, addons[id]]),
);

function comparable(document) {
  return JSON.stringify({ addons: document.addons ?? {} });
}

const unchanged = comparable(previous) === comparable({ addons: sortedAddons });

const output = {
  // Derived from publisher repositories. Regenerate with: pnpm derive:community
  //
  // The timestamp only moves when the facts do, so a scheduled refresh that
  // finds nothing new produces no diff — and an empty pull request never gets
  // opened for someone to review.
  generatedAt: unchanged && previous.generatedAt ? previous.generatedAt : new Date().toISOString(),
  addons: sortedAddons,
};

if (checkOnly) {
  if (!unchanged) {
    console.error(
      "error: community/derived.json is stale. Run: pnpm derive:community",
    );
    process.exit(1);
  }
  console.log("community/derived.json is current");
} else {
  await writeFile(derivedPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote community/derived.json (${Object.keys(output.addons).length} listings)`);
}
