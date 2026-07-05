import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import { createRoot, type Root } from "react-dom/client";
import FeesPage from "./pages/fees-page";

// Main addon component
function InvestmentFeesTrackerAddon({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="investment-fees-tracker-addon">
      <FeesPage ctx={ctx} />
    </div>
  );
}

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  context.api.logger.info("💰 Investment Fees Tracker addon is being enabled!");

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];
  let routeRoot: Root | undefined;

  try {
    // Add sidebar navigation item
    const sidebarItem = context.sidebar.addItem({
      id: "investment-fees-tracker",
      label: "Fee Tracker",
      icon: "receipt",
      route: "/addons/investment-fees-tracker",
      order: 200,
    });
    addedItems.push(sidebarItem);

    context.api.logger.debug("Sidebar navigation item added successfully");

    // Register route
    context.router.add({
      id: "investment-fees-tracker",
      path: "/addons/investment-fees-tracker",
      render({ root }) {
        const sharedQueryClient = context.api.query.getClient() as QueryClient;
        routeRoot ??= createRoot(root);
        routeRoot.render(
          <QueryClientProvider client={sharedQueryClient}>
            <InvestmentFeesTrackerAddon ctx={context} />
          </QueryClientProvider>,
        );
      },
    });

    context.api.logger.debug("Route registered successfully");
    context.api.logger.info("Investment Fees Tracker addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    // Re-throw the error so the addon system can handle it
    throw error;
  }

  // Register cleanup callback
  context.onDisable(() => {
    context.api.logger.info("🛑 Investment Fees Tracker addon is being disabled");

    // Remove all sidebar items
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error("Error removing sidebar item: " + (error as Error).message);
      }
    });

    // Unmount the addon's React tree
    routeRoot?.unmount();

    context.api.logger.info("Investment Fees Tracker addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
