import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import { createRoot, type Root } from "react-dom/client";
import ActivitySelectorPage from "./pages/activity-selector-page";
import DashboardPage from "./pages/dashboard-page";
import SettingsPage from "./pages/settings-page";

// Main addon component wrapper
function SwingfolioAddon({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="swingfolio-addon">
      <QueryClientProvider client={ctx.api.query.getClient() as QueryClient}>
        <DashboardPage ctx={ctx} />
      </QueryClientProvider>
    </div>
  );
}

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  context.api.logger.info("📈 Swingfolio addon is being enabled!");

  // Store references to items for cleanup
  const addedItems: { remove: () => void }[] = [];
  const roots: Root[] = [];

  try {
    // Add sidebar navigation item
    const sidebarItem = context.sidebar.addItem({
      id: "swingfolio",
      label: "Swingfolio",
      icon: "chart-bar",
      route: "/addons/swingfolio",
      order: 150,
    });
    addedItems.push(sidebarItem);

    // Register main dashboard route
    let dashboardRoot: Root | undefined;
    context.router.add({
      id: "swingfolio",
      path: "/addons/swingfolio",
      render({ root }) {
        if (!dashboardRoot) {
          dashboardRoot = createRoot(root);
          roots.push(dashboardRoot);
        }
        dashboardRoot.render(
          <QueryClientProvider client={context.api.query.getClient() as QueryClient}>
            <SwingfolioAddon ctx={context} />
          </QueryClientProvider>,
        );
      },
    });

    // Register activity selector route
    let activitiesRoot: Root | undefined;
    context.router.add({
      id: "swingfolio-activities",
      path: "/addons/swingfolio/activities",
      render({ root }) {
        if (!activitiesRoot) {
          activitiesRoot = createRoot(root);
          roots.push(activitiesRoot);
        }
        activitiesRoot.render(
          <QueryClientProvider client={context.api.query.getClient() as QueryClient}>
            <ActivitySelectorPage ctx={context} />
          </QueryClientProvider>,
        );
      },
    });

    // Register settings route
    let settingsRoot: Root | undefined;
    context.router.add({
      id: "swingfolio-settings",
      path: "/addons/swingfolio/settings",
      render({ root }) {
        if (!settingsRoot) {
          settingsRoot = createRoot(root);
          roots.push(settingsRoot);
        }
        settingsRoot.render(
          <QueryClientProvider client={context.api.query.getClient() as QueryClient}>
            <SettingsPage ctx={context} />
          </QueryClientProvider>,
        );
      },
    });

    context.api.logger.info("Swingfolio addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    throw error;
  }

  // Register cleanup callback
  context.onDisable(() => {
    context.api.logger.info("🛑 Swingfolio addon is being disabled");

    // Remove all sidebar items
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error("Error removing sidebar item: " + (error as Error).message);
      }
    });

    // Unmount all of the addon's React trees
    roots.forEach((root) => {
      try {
        root.unmount();
      } catch (error) {
        context.api.logger.error("Error unmounting route: " + (error as Error).message);
      }
    });

    context.api.logger.info("Swingfolio addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
