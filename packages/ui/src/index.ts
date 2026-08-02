// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The plugin runtime surface (curated design-system components + `cn`) is the
// canonical root barrel — it is what `@pairlens/ui` resolves to both for plugin
// type-checking and for the runtime bundle (`_sdk/pairlens-ui.js`).
export * from './plugin-surface'
export { useIsMobile } from './hooks/use-mobile'
