// TanStack React Query shim — exposes the host app's TanStack Query to dynamically loaded plugins.
// Plugins import `@tanstack/react-query` as an external; the import map resolves it here.
const Q = window.__PAIRLENS_TANSTACK_QUERY
if (!Q)
  throw new Error(
    '@pairlens/plugin-sdk: TanStack Query host not initialized. Ensure window.__PAIRLENS_TANSTACK_QUERY is set before loading plugins.',
  )
export default Q
export const {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} = Q
