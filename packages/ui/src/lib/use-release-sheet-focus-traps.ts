// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import * as React from 'react'

/**
 * Make vaul bottom sheets inert for the lifetime of the calling component.
 *
 * vaul 1.1.2 never forwards `modal={false}` to its internal Radix dialog, so
 * every open bottom sheet keeps a live Radix focus trap whose document-level
 * listeners drag focus back into the sheet the moment anything outside it is
 * focused. Base-ui dialogs (this library) never join Radix's focus-scope
 * stack, so a dialog opened ABOVE a sheet gets robbed: its text fields take a
 * caret for one tick and lose it — on iOS that reads as "the keyboard never
 * opens". `inert` makes the trap's `focus()` a silent no-op.
 *
 * Call from a component that only mounts while the dialog is open (a popup
 * content). Sheets already inert (their own swap machinery) are left alone
 * and NOT un-inerted on cleanup.
 */
export function useReleaseSheetFocusTraps(): void {
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const trapped = Array.from(
      document.querySelectorAll<HTMLElement>('[data-vaul-drawer]'),
    ).filter((element) => !element.hasAttribute('inert'))
    trapped.forEach((element) => element.setAttribute('inert', ''))
    return () => {
      trapped.forEach((element) => element.removeAttribute('inert'))
    }
  }, [])
}
