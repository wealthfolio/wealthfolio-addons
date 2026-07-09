import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import ActivitySelectorPage from "./pages/activity-selector-page";
import DashboardPage from "./pages/dashboard-page";
import SettingsPage from "./pages/settings-page";

// The host owns a single React root per addon and instantiates the route
// `component` itself (`React.createElement(Component, { location })`) with no
// access to the addon context. We capture the context at enable time in this
// module-level holder so the route wrappers can supply it (plus a shared
// QueryClientProvider) to the page components.
let addonCtx: AddonContext | undefined;

const withProviders = (page: React.ReactNode) => (
  <div className="swingfolio-addon">
    <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
      {page}
    </QueryClientProvider>
  </div>
);

const DashboardRoute = () => withProviders(<DashboardPage ctx={addonCtx!} />);
const ActivitiesRoute = () => withProviders(<ActivitySelectorPage ctx={addonCtx!} />);
const SettingsRoute = () => withProviders(<SettingsPage ctx={addonCtx!} />);

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  addonCtx = context;
  context.api.logger.info("📈 Swingfolio addon is being enabled!");

  try {
    // All three routes are declared in manifest.json `contributes.routes` (so
    // the host can render them before this addon boots — reload-safe deep
    // links + lazy activation). Each runtime id MUST match its declared
    // `contributes.routes[].id`. The sidebar entry comes from
    // `contributes.links.sidebar` — no runtime sidebar.addItem needed.
    context.router.add({
      id: "swingfolio",
      path: "/addons/swingfolio",
      component: DashboardRoute,
    });

    context.router.add({
      id: "swingfolio-activities",
      path: "/addons/swingfolio/activities",
      component: ActivitiesRoute,
    });

    context.router.add({
      id: "swingfolio-settings",
      path: "/addons/swingfolio/settings",
      component: SettingsRoute,
    });

    context.api.logger.info("Swingfolio addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    throw error;
  }

  // Register cleanup callback. The host owns the React root, so there is no
  // root to unmount here.
  context.onDisable(() => {
    context.api.logger.info("🛑 Swingfolio addon is being disabled");
    addonCtx = undefined;
    context.api.logger.info("Swingfolio addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
