/**
 * Tags that imply a standard notice. The permitted notice values live in
 * schemas/addon-store.schema.json; this file maps tags onto them, so a tax or
 * strategy addon always carries the matching notice regardless of when it was
 * submitted. The website renders the wording.
 */
export const NOTICE_BY_TAG = {
  tax: "not-tax-advice",
  taxes: "not-tax-advice",
  taxation: "not-tax-advice",
  cgt: "not-tax-advice",
  "capital-gains": "not-tax-advice",
  "wealth-tax": "not-tax-advice",

  rebalancing: "not-investment-advice",
  rebalance: "not-investment-advice",
  strategy: "not-investment-advice",
  "value-averaging": "not-investment-advice",
  "dollar-cost-averaging": "not-investment-advice",
  allocation: "not-investment-advice",
  "asset-allocation": "not-investment-advice",
  trading: "not-investment-advice",
  screener: "not-investment-advice",

  planning: "not-financial-advice",
  projections: "not-financial-advice",
  forecast: "not-financial-advice",
  retirement: "not-financial-advice",
  fire: "not-financial-advice",
};

/** Notices required by an addon's tags. */
export function requiredNotices(tags) {
  const required = new Set();
  for (const tag of tags ?? []) {
    const notice = NOTICE_BY_TAG[tag];
    if (notice) required.add(notice);
  }
  return [...required].sort();
}
