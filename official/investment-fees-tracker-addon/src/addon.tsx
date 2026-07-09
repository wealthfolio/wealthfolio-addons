import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import FeesPage from "./pages/fees-page";

// The host owns a single React root per addon and instantiates the route
// `component` itself (`React.createElement(Component, { location })`) with no
// access to the addon context. We capture the context at enable time in this
// module-level holder so the route wrapper can supply it (plus a shared
// QueryClientProvider) to the page component.
let addonCtx: AddonContext | undefined;

const FeesRoute = () => (
  <div className="investment-fees-tracker-addon">
    <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
      <FeesPage ctx={addonCtx!} />
    </QueryClientProvider>
  </div>
);

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  addonCtx = context;
  context.api.logger.info("💰 Investment Fees Tracker addon is being enabled!");

  try {
    // The route is declared in manifest.json `contributes.routes` (so the
    // host can render it before this addon boots — reload-safe deep links +
    // lazy activation). The runtime id MUST match the declared
    // `contributes.routes[].id`. The sidebar entry comes from
    // `contributes.links.sidebar` — no runtime sidebar.addItem needed.
    context.router.add({
      id: "investment-fees-tracker",
      path: "/addons/investment-fees-tracker",
      component: FeesRoute,
    });

    context.api.logger.debug("Route registered successfully");
    context.api.logger.info("Investment Fees Tracker addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    // Re-throw the error so the addon system can handle it
    throw error;
  }

  // Register cleanup callback. The host owns the React root, so there is no
  // root to unmount here.
  context.onDisable(() => {
    context.api.logger.info("🛑 Investment Fees Tracker addon is being disabled");
    addonCtx = undefined;
    context.api.logger.info("Investment Fees Tracker addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
