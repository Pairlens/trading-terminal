// React shim — exposes the host app's React instance to dynamically loaded plugins.
// Plugins import `react` as an external; the import map resolves it here.
const R = window.__PAIRLENS_REACT
if (!R)
  throw new Error(
    '@pairlens/plugin-sdk: React host not initialized. Ensure window.__PAIRLENS_REACT is set before loading plugins.',
  )
export default R
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = R
