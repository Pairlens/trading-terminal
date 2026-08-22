// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Which Discovery desk is open, published to the assistant ─────────
//
// Discovery is five boards behind one address. Telling the model "the
// user is on the discovery board" while they are staring at prediction
// markets is how you get an answer about BTC funding rates: the section
// decides which instruments the panes are even listing, so it is the
// first thing the model needs to know here.

import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'

/** Model-facing names. The i18n labels are for humans, not for prompts. */
const SECTION_NAMES: Record<DiscoverySectionId, string> = {
  spot: 'spot crypto',
  perp: 'perpetual futures',
  dex: 'on-chain DEX tokens',
  stocks: 'US equities',
  prediction: 'prediction markets',
  nft: 'NFT collections',
}

export function DiscoveryAssistantSurface({
  section,
  sections,
}: {
  section: DiscoverySectionId
  /** The sections this install actually has, in the user's own order. */
  sections: Array<DiscoverySectionId>
}) {
  useAssistantSurface({
    id: 'page:discovery',
    // Above the workspace board it sits on, below a chart pane: on
    // Discovery a chart is still the most specific thing on screen.
    getPriority: () => 30,
    revision: section,
    getContext: () => ({
      summary: `The user is on the Discovery board, ${SECTION_NAMES[section] ?? section} section. Every pane here is listing ${SECTION_NAMES[section] ?? section}, so default to that asset class unless they name another.`,
      detail: {
        section,
        assetClass: section,
        availableSections: sections,
      },
    }),
    getSuggestion: () => ({ key: 'assistantDock.suggest.discovery' }),
  })

  return null
}
