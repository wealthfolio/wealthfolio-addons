import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AddonContext,
  AddonEnableFunction,
  AddonRouteRenderContext,
} from "@wealthfolio/addon-sdk";
import { createRoot, type Root } from "react-dom/client";
import ActivitySelectorPage from "./pages/activity-selector-page";
import DashboardPage from "./pages/dashboard-page";
import SettingsPage from "./pages/settings-page";

// One React root is shared across all three routes. Creating a separate root
// for each route leaves orphaned trees in the sandbox after navigation.
let addonCtx: AddonContext | undefined;
let reactRoot: Root | undefined;
let rootElement: HTMLElement | undefined;

const withProviders = (page: React.ReactNode) => (
  <div className="swingfolio-addon">
    <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
      {page}
    </QueryClientProvider>
  </div>
);

const renderRoute = (getPage: () => React.ReactNode) =>
  function render({ root }: AddonRouteRenderContext) {
    if (!reactRoot || rootElement !== root) {
      reactRoot?.unmount();
      reactRoot = createRoot(root);
      rootElement = root;
    }
    reactRoot.render(withProviders(getPage()));
  };

const renderDashboard = renderRoute(() => <DashboardPage ctx={addonCtx!} />);
const renderActivities = renderRoute(() => <ActivitySelectorPage ctx={addonCtx!} />);
const renderSettings = renderRoute(() => <SettingsPage ctx={addonCtx!} />);

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  addonCtx = context;
  let removeSidebarItem: (() => void) | undefined;
  context.api.logger.info("📈 Swingfolio addon is being enabled!");

  try {
    // Current hosts ingest these routes from manifest.json before the addon
    // boots. Each runtime id MUST match its declared contributes.routes id.
    context.router.add({
      id: "swingfolio",
      path: "/addons/swingfolio-addon",
      render: renderDashboard,
    });

    context.router.add({
      id: "swingfolio-activities",
      path: "/addons/swingfolio-addon/activities",
      render: renderActivities,
    });

    context.router.add({
      id: "swingfolio-settings",
      path: "/addons/swingfolio-addon/settings",
      render: renderSettings,
    });

    // Current hosts use the durable manifest contribution. Registering the
    // same id at runtime keeps earlier 3.6.1 builds compatible; current hosts
    // deduplicate it in favor of the durable entry.
    const sidebarItem = context.sidebar.addItem({
      id: "swingfolio",
      label: "Swingfolio",
      icon: "chart-bar",
      route: "/addons/swingfolio-addon",
      order: 150,
    });
    removeSidebarItem = () => sidebarItem.remove();

    context.api.logger.info("Swingfolio addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info("🛑 Swingfolio addon is being disabled");
    removeSidebarItem?.();
    reactRoot?.unmount();
    reactRoot = undefined;
    rootElement = undefined;
    addonCtx = undefined;
    context.api.logger.info("Swingfolio addon disabled successfully");
  });
};

// Export the enable function as default
export default enable;
