/**
 * Canonical distribution layout for Wealthfolio-hosted (official) artifacts.
 *
 * The website's download service derives the same key from the addon id and
 * version (`src/lib/s3-download.ts`). Metadata never decides where an artifact
 * lives; it only records the key that the id and version already imply.
 */
export const ADDON_BUCKET_URL = "https://addons.wealthfolio.app";

export function r2Key(id, version) {
  return `${id}/${id}-${version}.zip`;
}

export function downloadUrl(id, version) {
  return `${ADDON_BUCKET_URL}/${r2Key(id, version)}`;
}
