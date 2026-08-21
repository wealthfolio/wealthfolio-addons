import { useQuery } from "@tanstack/react-query";
import { type AddonContext, type Holding } from "@wealthfolio/addon-sdk";

interface UseHoldingsOptions {
  ctx: AddonContext;
  /** Accounts to pull holdings from (derived from the selected swing activities). */
  accountIds: string[];
  enabled?: boolean;
}

/**
 * Fetch live holdings for the given accounts and merge them into a single list.
 *
 * Note: earlier Wealthfolio versions accepted a magic "TOTAL" accountId that
 * returned holdings aggregated across all accounts. The 3.x data-model refactor
 * removed that — `getHoldings` now resolves a single real account and returns an
 * empty list for an unknown id like "TOTAL". The addon bridge only exposes the
 * per-account `getHoldings(accountId)` (it has no portfolio-scope option), so we
 * fetch each account individually and combine the results.
 */
export function useHoldings({ ctx, accountIds, enabled = true }: UseHoldingsOptions) {
  return useQuery({
    queryKey: ["holdings", [...accountIds].sort()],
    queryFn: async (): Promise<Holding[]> => {
      if (!ctx.api) {
        throw new Error("API context is required");
      }

      const perAccount = await Promise.all(
        accountIds.map((accountId) =>
          ctx.api.portfolio.getHoldings(accountId).catch((error) => {
            ctx.api.logger.error(
              `Failed to load holdings for account ${accountId}: ${(error as Error).message}`,
            );
            return [] as Holding[];
          }),
        ),
      );

      // A symbol can be held in more than one account; the current price is the
      // same regardless, so de-duplicate by holding id to keep the list tidy.
      const merged = new Map<string, Holding>();
      for (const holding of perAccount.flat()) {
        if (holding?.id) merged.set(holding.id, holding);
      }
      return [...merged.values()];
    },
    enabled: enabled && !!ctx.api && accountIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
