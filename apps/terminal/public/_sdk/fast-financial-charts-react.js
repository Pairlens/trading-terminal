// fast-financial-charts/react shim — exposes the host app's React chart components to
// dynamically loaded plugins. Plugins import `fast-financial-charts/react` as an
// external; the import map resolves it here. Re-exporting the host instance
// avoids duplicating the WebGL engine into every plugin bundle.
const C = window.__PAIRLENS_CHARTS_REACT
if (!C)
  throw new Error(
    'fast-financial-charts/react: host not initialized. Ensure window.__PAIRLENS_CHARTS_REACT is set before loading plugins.',
  )
export const {
  FastFinancialChart,
  FastFinancialChartCanvas,
  useFastChartController,
  useFastChartMcp,
  useFastChartTheme,
  useFastChartDrawings,
  DepthChart,
} = C
