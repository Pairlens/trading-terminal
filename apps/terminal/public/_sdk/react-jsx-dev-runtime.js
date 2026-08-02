// JSX dev-runtime shim — plugins built in dev mode import from 'react/jsx-dev-runtime'.
const R = window.__PAIRLENS_REACT_JSX_DEV
if (!R)
  throw new Error(
    '@pairlens/plugin-sdk: React JSX dev runtime not initialized.',
  )
export const { jsx, jsxs, jsxDEV, Fragment } = R
