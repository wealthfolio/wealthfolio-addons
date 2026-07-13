import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type {
  AddonContext,
  AddonEnableFunction,
  AddonRouteRenderContext,
} from "@wealthfolio/addon-sdk";
import { createRoot, type Root } from "react-dom/client";
import FeesPage from "./pages/fees-page";

// One React root is shared across every render of this addon route. Creating a
// new root for each render leaves orphaned trees in the sandbox.
let addonCtx: AddonContext | undefined;
let reactRoot: Root | undefined;
let rootElement: HTMLElement | undefined;

const FeesRoute = () => (
  <div className="investment-fees-tracker-addon">
    <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
      <FeesPage ctx={addonCtx!} />
    </QueryClientProvider>
  </div>
);

function renderFees({ root }: AddonRouteRenderContext) {
  if (!reactRoot || rootElement !== root) {
    reactRoot?.unmount();
    reactRoot = createRoot(root);
    rootElement = root;
  }
  reactRoot.render(<FeesRoute />);
}

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  addonCtx = context;
  let removeSidebarItem: (() => void) | undefined;
  context.api.logger.info("💰 Investment Fees Tracker addon is being enabled!");

  try {
    // Current hosts ingest this route from manifest.json before the addon
    // boots. The runtime id MUST match the declared contributes.routes id.
    context.router.add({
      id: "investment-fees-tracker",
      path: "/addons/investment-fees-tracker-addon",
      render: renderFees,
    });

    // Current hosts use the durable manifest contribution. Registering the
    // same id at runtime keeps earlier 3.6.1 builds compatible; current hosts
    // deduplicate it in favor of the durable entry.
    const sidebarItem = context.sidebar.addItem({
      id: "investment-fees-tracker",
      label: "Fee Tracker",
      icon: "receipt",
      route: "/addons/investment-fees-tracker-addon",
      order: 200,
    });
    removeSidebarItem = () => sidebarItem.remove();

    context.api.logger.debug("Route registered successfully");
    context.api.logger.info("Investment Fees Tracker addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    // Re-throw the error so the addon system can handle it
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info("🛑 Investment Fees Tracker addon is being disabled");
    removeSidebarItem?.();
    reactRoot?.unmount();
    reactRoot = undefined;
    rootElement = undefined;
    addonCtx = undefined;
    context.api.logger.info("Investment Fees Tracker addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
