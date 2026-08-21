import { spawnSync } from "node:child_process";

/**
 * Minimal GitHub reads for deriving listing facts.
 *
 * Uses GITHUB_TOKEN when present (CI), otherwise the local gh CLI's token.
 * Unauthenticated requests work too, but 60/hour runs out quickly.
 */

let cachedToken;

function token() {
  if (cachedToken !== undefined) return cachedToken;
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN;
    return cachedToken;
  }
  const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  cachedToken = result.status === 0 ? result.stdout.trim() : null;
  return cachedToken;
}

/** Owner/repo for a github.com URL, or null for anything else. */
export function parseRepository(repositoryUrl) {
  let url;
  try {
    url = new URL(repositoryUrl);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com") return null;

  // A query or fragment is never part of a repository's identity, and silently
  // dropping one means validation reads a different URL than the page links to.
  if (url.search || url.hash) return null;

  const segments = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (segments.length !== 2) return null;

  const [owner, repo] = segments;
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function request(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "wealthfolio-addons-directory",
  };
  const auth = token();
  if (auth) headers.authorization = `Bearer ${auth}`;

  const response = await fetch(`https://api.github.com/${path}`, { headers });

  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) {
    throw new Error(`GitHub rate limit reached while reading ${path}`);
  }
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${path}`);
  }

  return response.json();
}

export async function fetchRepository({ owner, repo }) {
  return request(`repos/${owner}/${repo}`);
}

export async function fetchHeadCommit({ owner, repo }, branch) {
  const data = await request(`repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`);
  return data?.sha ?? null;
}

/** File contents at a specific ref, decoded, or null when absent. */
export async function fetchFile({ owner, repo }, filePath, ref) {
  const data = await request(
    `repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
  );
  if (!data?.content) return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}
