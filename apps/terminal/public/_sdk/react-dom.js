// ReactDOM shim — exposes the host app's ReactDOM instance to plugins.
const RD = window.__PAIRLENS_REACT_DOM
if (!RD) throw new Error('@pairlens/plugin-sdk: ReactDOM host not initialized.')
export default RD
export const { createPortal, flushSync, version, createRoot, hydrateRoot } = RD
