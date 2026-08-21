import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const hostProvidedDependencies = [
  "@tanstack/react-query",
  "@wealthfolio/addon-sdk",
  "@wealthfolio/ui",
  "@wealthfolio/ui/chart",
  "date-fns",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "recharts",
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Define process.env.NODE_ENV to remove development-only code
    "process.env.NODE_ENV": JSON.stringify("production"),
    // You can define other process.env variables if needed by your addon
    // 'process.env.SOME_VAR': JSON.stringify('some_value')
  },
  build: {
    target: ["chrome107", "edge107", "firefox104", "safari16"],
    lib: {
      entry: "src/addon.tsx",
      fileName: () => "addon.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: hostProvidedDependencies,
    },
    outDir: "dist",
    minify: true,
    sourcemap: false,
  },
});
