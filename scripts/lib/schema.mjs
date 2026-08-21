import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readJson, repoRoot } from "./addon-records.mjs";

export const schemaPath = path.join(repoRoot, "schemas/addon-store.schema.json");

/**
 * Compiles the published store schema. The schema — not this script — is the
 * source of truth, so the two can no longer drift.
 */
export async function createStoreValidator() {
  const schema = await readJson(schemaPath);
  // strictRequired is off because the conditional branches intentionally require
  // properties that are declared once, at the top level.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function formatSchemaErrors(label, ajvErrors) {
  return (ajvErrors ?? []).map((error) => {
    const location = error.instancePath || "(root)";
    const detail = error.params?.allowedValues
      ? `${error.message} (${error.params.allowedValues.join(", ")})`
      : error.message;
    return `${label}: ${location} ${detail}`;
  });
}
