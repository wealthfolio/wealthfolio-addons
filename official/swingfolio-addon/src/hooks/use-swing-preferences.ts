import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { SwingTradePreferences } from "../types";

const DEFAULT_PREFERENCES: SwingTradePreferences = {
  selectedActivityIds: [],
  includeSwingTag: true,
  selectedAccounts: [],
  lotMatchingMethod: "FIFO",
  defaultDateRange: "YTD",
  calendarWeekStart: "locale",
  defaultDashboardView: "overview",
  includeFees: true,
  includeDividends: false,
};

const PREFERENCES_KEY = "swingfolio_preferences";

export function useSwingPreferences(ctx: AddonContext) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["swing-preferences"],
    queryFn: async (): Promise<SwingTradePreferences> => {
      try {
        const stored = await ctx.api.storage.get(PREFERENCES_KEY);
        if (stored) {
          return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        }
        return DEFAULT_PREFERENCES;
      } catch (error) {
        ctx.api.logger.warn(
          "Failed to load preferences, using defaults: " + (error as Error).message,
        );
        return DEFAULT_PREFERENCES;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const mutation = useMutation({
    // Serialize concurrent preference writes: rapid mutations (e.g.
    // double-toggling a checkbox) would otherwise read the same stale snapshot
    // and the later write would silently undo the earlier one.
    scope: { id: "swing-preferences" },
    mutationFn: async (preferences: Partial<SwingTradePreferences>) => {
      // Merge onto the freshest state at EXECUTION time (not the render-time
      // closure): read the cache, and before the initial load has populated
      // it, re-read storage — falling back to defaults here would silently
      // wipe saved fields.
      let current = queryClient.getQueryData<SwingTradePreferences>(["swing-preferences"]);
      if (!current) {
        const stored = await ctx.api.storage.get(PREFERENCES_KEY);
        current = stored
          ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
          : DEFAULT_PREFERENCES;
      }
      const updated = { ...current, ...preferences };
      await ctx.api.storage.set(PREFERENCES_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["swing-preferences"], data);
      ctx.api.logger.debug("Swing preferences updated successfully");
    },
    onError: (error) => {
      // Surface the failure — a silent save error leaves the UI reverting on
      // the next read with no explanation.
      ctx.api.toast.error("Failed to save Swingfolio preferences: " + error.message);
      ctx.api.logger.error("Failed to save preferences: " + error.message);
    },
  });

  return {
    preferences: query.data || DEFAULT_PREFERENCES,
    isLoading: query.isLoading,
    error: query.error,
    updatePreferences: mutation.mutate,
    // Await-able variant for flows that must not proceed until the write
    // settles (e.g. save-then-navigate).
    updatePreferencesAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
