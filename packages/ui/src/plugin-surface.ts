// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Plugin runtime surface for the Pairlens design system.
 *
 * This is the entry point bundled to `apps/terminal/public/_sdk/pairlens-ui.js`
 * (see the `build:plugin-surface` script) and resolved by the `@pairlens/ui`
 * import-map entry in `__root.tsx`. Dynamically-loaded plugins import design
 * system components from here:
 *
 *   import { Button, Badge, Dialog } from '@pairlens/ui'
 *
 * React / React DOM / TanStack Query are marked external in the bundle, so the
 * host's single React instance is shared (portals, context, and theme tokens all
 * work). The presentational components themselves are bundled — a harmless
 * duplicate of stateless UI code.
 *
 * NOT included on purpose:
 *  - `sonner` (toasts): relies on a host-mounted <Toaster> singleton. Plugins
 *    must use the SDK's `useNotify()` instead.
 *  - Heavy/rare components (calendar, carousel, chart, sidebar, command, drawer):
 *    keep the bundle lean. Plugins needing these bundle them in their own build.
 *
 * Only add files here whose exported names do NOT collide with another listed
 * file (`export *` drops ambiguous names silently).
 */

// Utilities
export { cn } from './lib/utils'

// Core controls
export * from './components/ui/button'
export * from './components/ui/badge'
export * from './components/ui/input'
export * from './components/ui/textarea'
export * from './components/ui/label'
export * from './components/ui/switch'
export * from './components/ui/checkbox'
export * from './components/ui/radio-group'
export * from './components/ui/select'
export * from './components/ui/slider'
export * from './components/ui/toggle'
export * from './components/ui/toggle-group'

// Layout & surfaces
export * from './components/ui/card'
export * from './components/ui/separator'
export * from './components/ui/scroll-area'
export * from './components/ui/tabs'
export * from './components/ui/table'
export * from './components/ui/skeleton'
export * from './components/ui/spinner'
export * from './components/ui/progress'
export * from './components/ui/kbd'
export * from './components/ui/empty'
export * from './components/ui/alert'

// Overlays (portal-based; share host React DOM)
export * from './components/ui/dialog'
export * from './components/ui/alert-dialog'
export * from './components/ui/popover'
export * from './components/ui/tooltip'
export * from './components/ui/dropdown-menu'
export * from './components/ui/hover-card'
