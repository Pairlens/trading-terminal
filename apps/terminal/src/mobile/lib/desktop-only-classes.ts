// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Asset classes the phone has no surface for.
 *
 * A leaf module because TWO places have to agree, and they run at different
 * times: `mobile-terminal-root` seeds its focus straight from the address at
 * mount, and `use-mobile-route-sync` reconciles the address afterwards. Getting
 * this into only the second one is what turned a shared NFT link into a crash:
 * the seed adopted `cls: 'nft'`, the shell mounted a tree with no chart
 * provider under it, and the board came up on the error boundary.
 *
 * NFTs are a desktop surface for now. The phone could chart a floor, but the
 * class IS the ladder, the traits and the sweep ticket, and half of that on a
 * 402px screen is a worse answer than an honest redirect. Delete the entry when
 * the mobile NFT panels ship, and delete the whole module when nothing is left
 * in it.
 */
import type { InstrumentClass } from '@pairlens/shared/market-ref'

export const DESKTOP_ONLY_CLASSES: ReadonlyArray<InstrumentClass> = ['nft']

export function isDesktopOnlyClass(cls: InstrumentClass): boolean {
  return DESKTOP_ONLY_CLASSES.includes(cls)
}
