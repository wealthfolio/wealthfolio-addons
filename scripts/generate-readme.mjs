import { writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  authorName,
  description,
  displayName,
  getAddonRecords,
  releaseVersion,
  readJson,
  repoRoot,
} from "./lib/addon-records.mjs";

const derivedPath = path.join(repoRoot, "community/derived.json");
const derived = existsSync(derivedPath) ? (await readJson(derivedPath)).addons ?? {} : {};

const COMPATIBILITY_LABEL = {
  current: "SDK 3.6+",
  "predates-sandbox": "pre-3.6 — rebuild needed",
  unknown: "no usable SDK version",
};

/**
 * Publisher-supplied text lands in a Markdown table. The schema already forbids
 * newlines and angle brackets, but escape the table separator and the
 * characters that would otherwise render as markup: a listing must not be able
 * to restructure the table or inject a link into it.
 */
function cell(value) {
  return String(value ?? "")
    .replace(/[<>]/g, (character) => (character === "<" ? "&lt;" : "&gt;"))
    .replace(/[\\`*_[\]|]/g, (character) => `\\${character}`)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Markdown link destinations end a URL at the first unescaped `)`, so a URL
 * containing one can close the link early and start a second, attacker-chosen
 * one. The schema already restricts `repository` to a canonical GitHub URL;
 * encoding here means a future loosening cannot reopen the hole.
 */
function linkDestination(url) {
  return String(url).replace(/[()\\<>\[\]]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function communityRow(record) {
  const metadata = record.metadata;
  const facts = derived[metadata.id] ?? {};
  const repo = metadata.repository ? `[Repo](${linkDestination(metadata.repository)})` : "";
  const compatibility = COMPATIBILITY_LABEL[facts.compatibility?.state] ?? "unknown";
  return `| ${cell(displayName(record))} | ${cell(authorName(metadata.author))} | ${cell(metadata.status)} | ${cell(facts.license ?? "none")} | ${cell(compatibility)} | ${repo} |`;
}

function officialRow(record) {
  const metadata = record.metadata;
  return `| ${cell(displayName(record))} | ${cell(description(record))} | ${cell(metadata.status)} | ${cell(releaseVersion(record))} |`;
}

const records = await getAddonRecords();
const official = records.filter((record) => record.metadata.trust === "official");
const community = records.filter((record) => record.metadata.trust === "community");

const communityHeader =
  "| Addon | Publisher | Status | Licence | Runtime | Repo |\n| --- | --- | --- | --- | --- | --- |";
const officialHeader =
  "| Addon | Description | Status | Version |\n| --- | --- | --- | --- |";

await writeFile(
  path.join(repoRoot, "community/README.md"),
  `# Community Addons

Community addons are independently published. Wealthfolio does not build, host,
audit, endorse, or support them. This directory is a discovery listing: the
package is downloaded from the publisher's own repository and installed with
**Install from File** in Wealthfolio.

Listing requirements and the publisher attestation are in
[POLICIES.md](../POLICIES.md).

${communityHeader}
${community.map(communityRow).join("\n")}

Licence and runtime are **derived** from each publisher's repository, not
declared here — see [community/derived.json](derived.json), refreshed with
\`pnpm derive:community\`.

Only \`active\` entries appear on
[wealthfolio.app/addons/community](https://wealthfolio.app/addons/community). A
listing cannot become active while its repository has no detectable licence, or
while its manifest does not declare a readable \`sdkVersion\` of 3.6 or newer —
before that release an addon could reach the network without declaring it, so
its manifest cannot show where data goes.
`,
);

await writeFile(
  path.join(repoRoot, "official/README.md"),
  `# Official Addons

Official addons are built, distributed, and supported by Wealthfolio. They are
the only addons installable directly from within the app.

${officialHeader}
${official.map(officialRow).join("\n")}
`,
);

console.log("Generated official/README.md and community/README.md");
