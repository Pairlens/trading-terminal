// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover → "All markets": the full market list as a screen.
 *
 * SEAM STUB — keeps the overlay wiring compilable while the Discover
 * workstream fills the screen in. Replacing this file's contents is the whole
 * integration; nothing else needs to change.
 */
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

export default function MarketsScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'markets' }>
  onClose: () => void
}) {
  return (
    <FullScreenOverlay display onBack={onClose} title="">
      <div />
    </FullScreenOverlay>
  )
}
