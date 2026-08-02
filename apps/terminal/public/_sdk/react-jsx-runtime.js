// JSX runtime shim — plugins built with modern JSX transform import from 'react/jsx-runtime'.
const R = window.__PAIRLENS_REACT_JSX
if (!R)
  throw new Error('@pairlens/plugin-sdk: React JSX runtime not initialized.')
export const { jsx, jsxs, Fragment } = R
