// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One connected credential: rename, permissions, disconnect.
 *
 * SEAM STUB — keeps the overlay wiring compilable while the accounts
 * workstream fills the screen in. Replacing this file's contents is the whole
 * integration; nothing else needs to change.
 */
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'

export default function AccountDetailScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'accountDetail' }>
  onClose: () => void
}) {
  return (
    <FullScreenOverlay onBack={onClose} title="">
      <div />
    </FullScreenOverlay>
  )
}
