// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Expose shared runtime singletons as globals so that the import-map shim files
 * (`public/_sdk/*.js`) can re-export them to dynamically loaded plugins.
 *
 * The Plugin SDK and the design system bundle are served as static files
 * (`/_sdk/plugin-sdk.js`, `/_sdk/pairlens-ui.js`) and resolved via the import
 * map — they do not need a global (React is external in those bundles, so the
 * host's instance is still shared). Charts re-export the host's instances via a
 * global so the WebGL engine is not duplicated into a plugin bundle.
 *
 * This MUST run before any plugin module is dynamically imported.
 */
import * as React from 'react'
import * as ReactJSX from 'react/jsx-runtime'
import * as ReactJSXDev from 'react/jsx-dev-runtime'
import * as ReactDOM from 'react-dom'
import * as TanStackQuery from '@tanstack/react-query'
import * as PairlensCharts from '@pairlens/fast-financial-charts'
import * as PairlensChartsReact from '@pairlens/fast-financial-charts/react'

declare global {
  interface Window {
    __PAIRLENS_REACT: typeof React
    __PAIRLENS_REACT_JSX: typeof ReactJSX
    __PAIRLENS_REACT_JSX_DEV: typeof ReactJSXDev
    __PAIRLENS_REACT_DOM: typeof ReactDOM
    __PAIRLENS_TANSTACK_QUERY: typeof TanStackQuery
    __PAIRLENS_CHARTS: typeof PairlensCharts
    __PAIRLENS_CHARTS_REACT: typeof PairlensChartsReact
  }
}

if (typeof window !== 'undefined') {
  window.__PAIRLENS_REACT = React
  window.__PAIRLENS_REACT_JSX = ReactJSX
  window.__PAIRLENS_REACT_JSX_DEV = ReactJSXDev
  window.__PAIRLENS_REACT_DOM = ReactDOM
  window.__PAIRLENS_TANSTACK_QUERY = TanStackQuery
  window.__PAIRLENS_CHARTS = PairlensCharts
  window.__PAIRLENS_CHARTS_REACT = PairlensChartsReact
}
