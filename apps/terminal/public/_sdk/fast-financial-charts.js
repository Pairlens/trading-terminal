// fast-financial-charts shim — exposes the host app's chart engine to dynamically
// loaded plugins. Plugins import `fast-financial-charts` as an external; the import
// map resolves it here. Re-exporting the host instance avoids duplicating the
// WebGL engine into every plugin bundle.
const C = window.__PAIRLENS_CHARTS
if (!C)
  throw new Error(
    'fast-financial-charts: host not initialized. Ensure window.__PAIRLENS_CHARTS is set before loading plugins.',
  )
export const {
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
  getThemePreset,
  ChartEngine,
} = C
