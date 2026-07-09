import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { SwingActivity } from "../types";
import { useSwingPreferences } from "./use-swing-preferences";

export function useSwingActivities(ctx: AddonContext) {
  const { preferences } = useSwingPreferences(ctx);
  const { selectedActivityIds } = preferences;

  // isSelected is derived client-side via `select` rather than in the queryFn:
  // keying the query on selectedActivityIds would re-run the full activities
  // search over the RPC bridge on every save/clear just to recompute a flag.
  const selectWithSelection = useCallback(
    (activities: SwingActivity[]): SwingActivity[] => {
      const selected = new Set(selectedActivityIds);
      return activities.map((activity) => ({
        ...activity,
        isSelected: selected.has(activity.id),
      }));
    },
    [selectedActivityIds],
  );

  return useQuery({
    queryKey: ["swing-activities", preferences.selectedAccounts, preferences.includeDividends],
    queryFn: async (): Promise<SwingActivity[]> => {
      try {
        // Use search API with filters for BUY/SELL/SPLIT activities, and optionally DIVIDEND
        const activityTypes = ["BUY", "SELL", "SPLIT"];
        if (preferences.includeDividends) {
          activityTypes.push("DIVIDEND");
        }

        const filters = {
          activityTypes: activityTypes,
          ...(preferences.selectedAccounts.length > 0 && {
            accountIds: preferences.selectedAccounts,
          }),
        };

        const response = await ctx.api.activities.search(
          0, // page
          10000, // large page size to get all relevant activities
          filters,
          "", // no search keyword
          { id: "date", desc: true }, // sort by date descending
        );

        // Transform to SwingActivity format (isSelected is filled in by select)
        const swingActivities: SwingActivity[] = response.data.map((activity) => ({
          ...activity,
          isSelected: false,
          hasSwingTag: activity.comment?.toLowerCase().includes("swing") || false,
        }));

        return swingActivities;
      } catch (error) {
        ctx.api.logger.error("Failed to fetch swing activities: " + (error as Error).message);
        throw error;
      }
    },
    select: selectWithSelection,
    enabled: !!ctx.api,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
