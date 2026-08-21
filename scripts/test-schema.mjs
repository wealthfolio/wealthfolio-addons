/**
 * Schema regression tests.
 *
 * Every rule the directory depends on has a fixture here, so a well-meaning
 * schema edit cannot quietly reopen a hole. Also validates the submission
 * templates, which are not part of the addon record walk.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createStoreValidator, formatSchemaErrors } from "./lib/schema.mjs";
import { readJson, repoRoot } from "./lib/addon-records.mjs";
import { requiredNotices } from "./lib/notices.mjs";
import { r2Key, downloadUrl } from "./lib/distribution.mjs";

const validate = await createStoreValidator();
const failures = [];

function expect(name, condition, detail = "") {
  if (condition) return;
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function communityBase(overrides = {}) {
  return {
    id: "my-addon",
    name: "My Addon",
    description: "Does a thing.",
    author: { name: "Someone", url: "https://github.com/someone" },
    trust: "community",
    status: "active",
    tags: ["analytics"],
    repository: "https://github.com/someone/my-addon",
    commercialModel: "free",
    ...overrides,
  };
}

function officialBase(overrides = {}) {
  return {
    id: "my-official-addon",
    trust: "official",
    status: "active",
    tags: ["analytics"],
    release: { version: "1.0.0", minWealthfolioVersion: "3.7.0" },
    distribution: { r2Path: "my-official-addon/my-official-addon-1.0.0.zip" },
    media: { coverLight: "assets/cover-light.webp", coverDark: "assets/cover-dark.webp" },
    ...overrides,
  };
}

function accepts(name, value) {
  expect(name, validate(value), formatSchemaErrors(name, validate.errors).join("; "));
}

function rejects(name, value) {
  expect(name, !validate(value), "schema accepted an invalid document");
}

// --- accepted baselines -----------------------------------------------------
accepts("valid community entry", communityBase());
accepts("valid official entry", officialBase());
accepts(
  "pending community entry may omit even the commercial model",
  communityBase({ status: "pending", commercialModel: undefined }),
);
accepts(
  "optional publisher clarification is still allowed",
  communityBase({
    privacyUrl: "https://example.com/privacy",
    license: "MIT",
    supportUrl: "https://example.com/support",
    minWealthfolioVersion: "3.7.0",
    notices: ["not-tax-advice"],
    dataHandling: {
      leavesDevice: true,
      externalServices: [{ name: "Example", url: "https://example.com" }],
    },
  }),
);
rejects(
  "active community entry without a commercial model",
  communityBase({ commercialModel: undefined }),
);

// --- rejected ---------------------------------------------------------------
rejects("retired verification axis", communityBase({ verification: "verified" }));
rejects("community entry claiming a Wealthfolio-hosted artifact", communityBase({
  distribution: { r2Path: "my-addon/my-addon-1.0.0.zip" },
}));
rejects("official entry without distribution", officialBase({ distribution: undefined }));
rejects("official entry without media", officialBase({ media: undefined }));
rejects("official entry without release", officialBase({ release: undefined }));
rejects(
  "leavesDevice true without privacyUrl",
  communityBase({ dataHandling: { leavesDevice: true, externalServices: [] } }),
);
rejects(
  "externalServices declared while leavesDevice is false",
  communityBase({
    dataHandling: {
      leavesDevice: false,
      externalServices: [{ name: "Example", url: "https://example.com" }],
    },
  }),
);
rejects("non-SPDX license", communityBase({ license: "https://example.com/license" }));
rejects("http repository", communityBase({ repository: "http://github.com/someone/my-addon" }));
rejects("non-https support URL", communityBase({ supportUrl: "http://example.com/x" }));
rejects(
  "repository URL with embedded credentials",
  communityBase({ repository: "https://user:pass@github.com/someone/my-addon" }),
);
rejects("unknown notice", communityBase({ notices: ["not-legal-advice"] }));
rejects("unknown top-level field", communityBase({ downloadUrl: "https://example.com/a.zip" }));
rejects("unknown trust tier", communityBase({ trust: "verified" }));

// --- regression: official media must be usable (review finding P2) ---
rejects("official entry with an empty media object", officialBase({ media: {} }));
rejects("official entry with only a light cover", officialBase({ media: { coverLight: "media/cover-light.webp" } }));

// --- regression: publisher text must be genuinely plain (review finding P2) ---
rejects("pipe in name would break the generated table", communityBase({ name: "A | B" }));
rejects("html in description", communityBase({ description: "see <b>official</b> build" }));
rejects("newline in description", communityBase({ description: "line one\nline two" }));
rejects("backtick in name", communityBase({ name: "My `code` addon" }));

// --- regression: valid HTTPS shapes must be accepted (review finding P2) ---
accepts("query-only URL", communityBase({ supportUrl: "https://example.com?section=support" }));
accepts("fragment-only URL", communityBase({ supportUrl: "https://example.com#privacy" }));
accepts("port in URL", communityBase({ supportUrl: "https://example.com:8443/support" }));
rejects("credentials survive the looser pattern", communityBase({
  supportUrl: "https://user:pass@example.com/x",
}));
rejects("http survives the looser pattern", communityBase({ supportUrl: "http://example.com/x" }));

// --- regression: repository links cannot smuggle a second link (review P2) ---
rejects("repository URL with a markdown-breaking fragment", communityBase({
  repository: "https://github.com/owner/repo#)](https://evil.example)",
}));
rejects("repository URL with a query", communityBase({ repository: "https://github.com/o/r?a=b" }));
rejects("non-GitHub repository", communityBase({ repository: "https://gitlab.com/o/r" }));
rejects("repository deep link", communityBase({ repository: "https://github.com/o/r/tree/main" }));
accepts("canonical GitHub repository", communityBase({ repository: "https://github.com/o/r" }));

// --- regression: publisher names are rendered, so they must be plain (review P2) ---
rejects("HTML in author object", communityBase({ author: { name: "<a href=x>c</a>" } }));
rejects("HTML in author string", communityBase({ author: "<a href=x>c</a>" }));
rejects("pipe in author", communityBase({ author: { name: "a | b" } }));
rejects("HTML in an external service name", communityBase({
  privacyUrl: "https://example.com/p",
  dataHandling: {
    leavesDevice: true,
    externalServices: [{ name: "<b>Bank</b>", url: "https://example.com" }],
  },
}));
accepts("plain author", communityBase({ author: { name: "someone" } }));

// --- notice taxonomy --------------------------------------------------------
expect(
  "tax tag requires the tax notice",
  requiredNotices(["tax", "analytics"]).includes("not-tax-advice"),
);
expect(
  "rebalancing tag requires the investment notice",
  requiredNotices(["rebalancing"]).includes("not-investment-advice"),
);
expect(
  "planning tag requires the financial notice",
  requiredNotices(["planning"]).includes("not-financial-advice"),
);
expect("untagged categories require no notice", requiredNotices(["dividends"]).length === 0);

// --- distribution layout ----------------------------------------------------
expect(
  "r2 key matches the website download service layout",
  r2Key("swingfolio-addon", "3.6.2") === "swingfolio-addon/swingfolio-addon-3.6.2.zip",
);
expect(
  "download url matches the website download service",
  downloadUrl("swingfolio-addon", "3.6.2") ===
    "https://addons.wealthfolio.app/swingfolio-addon/swingfolio-addon-3.6.2.zip",
);

// --- templates --------------------------------------------------------------
const templatesDir = path.join(repoRoot, "templates");
for (const entry of await readdir(templatesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(templatesDir, entry.name, "addon.store.json");
  const label = `templates/${entry.name}/addon.store.json`;
  const template = await readJson(file);
  expect(label, validate(template), formatSchemaErrors(label, validate.errors).join("; "));
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Schema tests passed");
