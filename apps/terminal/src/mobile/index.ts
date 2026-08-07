// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mobile terminal's only public surface.
 *
 * Everything mobile lives under `src/mobile/**` and imports *into* the app —
 * hooks, stores, pure helpers, dialogs — never the reverse. No file outside
 * this directory may import from it except the sanctioned shell touchpoints
 * (`routes/_terminal.tsx`, and `onboarding-spotlight.tsx` for
 * `useViewportMode`). That one-way edge is what makes a native app or a
 * browser extension a re-host of this code rather than a rewrite.
 *
 * The shell itself is code-split: a desktop session must not download the
 * phone terminal, and `useViewportMode` — the gate — has to stay static so the
 * branch is decided on the first render rather than after a chunk arrives.
 */
import { lazyChunk } from '@/lib/lazy-chunk'

export const MobileTerminalRoot = lazyChunk(() =>
  import('./mobile-terminal-root').then((m) => ({
    default: m.MobileTerminalRoot,
  })),
)

export { useViewportMode } from './use-viewport-mode'
export type { ViewportMode } from './use-viewport-mode'
