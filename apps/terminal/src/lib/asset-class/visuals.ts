// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What each asset class LOOKS like — one table, read by every surface that
 * names a class.
 *
 * Spot, perps, on-chain pools, launchpad tokens, equities and event contracts
 * behave like six different products: they settle differently, they carry different risk, and
 * an order means a different thing on each. The terminal used to leave that
 * distinction implicit in the symbol's shape ('BTC-USDT' vs 'AAPL'), which is
 * a rule you have to already know to read. So each class gets a fixed hue, a
 * fixed icon and a fixed short label, and every surface that mentions a class
 * spends the same three: the pair badge in the trade header, the Discovery
 * tabs, the markets scanner chips. Learn the colour on one screen, recognise
 * it on the next.
 *
 * The hues are CSS tokens (`--asset-*` in @pairlens/ui), NOT theme tokens: a
 * theme repainting them would unteach the association it took a session to
 * build. They are ~55 degrees apart so no two read alike at 10px, and nothing
 * here ships colour alone — every consumer draws the label or the icon beside
 * it, which is what keeps the meaning available without colour vision.
 *
 * A pure leaf module: no React, no i18n runtime, no plugin registry. It hands
 * back class-name strings and literal translation keys, so it is testable and
 * so the i18n orphan audit can see the keys.
 */
import type { InstrumentClass } from '@pairlens/shared/market-ref'

export type AssetClassVisual = {
  /** Short badge label: SPOT, PERP, DEX, STOCK, EVENT. */
  labelKey: string
  /**
   * The class spelled out, for tooltips and screen readers. Deliberately the
   * Discovery tab's own key: the tab and the badge must never end up calling
   * the same class two different things in the same language.
   */
  nameKey: string
  /** One line on what the class IS — the tooltip body that does the teaching. */
  descriptionKey: string
  /** Lucide icon name, the same one the Discovery tab and the scanner chip use. */
  icon: string
  /**
   * Tailwind class names, written out in full because Tailwind reads source
   * text: `text-asset-${cls}` compiles to nothing at all.
   */
  text: string
  bg: string
  border: string
  /** Tint for a selected tab or chip — heavier than `bg`, still behind text. */
  activeBg: string
}

export const ASSET_CLASS_VISUALS: Readonly<
  Record<InstrumentClass, AssetClassVisual>
> = {
  spot: {
    labelKey: 'assetClass.spot',
    nameKey: 'discovery.sections.spot',
    descriptionKey: 'assetClass.spotDescription',
    icon: 'Bitcoin',
    text: 'text-asset-spot',
    bg: 'bg-asset-spot/12',
    border: 'border-asset-spot/30',
    activeBg: 'bg-asset-spot/15',
  },
  perp: {
    labelKey: 'assetClass.perp',
    nameKey: 'discovery.sections.perp',
    descriptionKey: 'assetClass.perpDescription',
    icon: 'Layers',
    text: 'text-asset-perp',
    bg: 'bg-asset-perp/12',
    border: 'border-asset-perp/30',
    activeBg: 'bg-asset-perp/15',
  },
  dex: {
    labelKey: 'assetClass.dex',
    nameKey: 'discovery.sections.dex',
    descriptionKey: 'assetClass.dexDescription',
    icon: 'Flame',
    text: 'text-asset-dex',
    bg: 'bg-asset-dex/12',
    border: 'border-asset-dex/30',
    activeBg: 'bg-asset-dex/15',
  },
  memecoin: {
    labelKey: 'assetClass.memecoin',
    nameKey: 'discovery.sections.memecoin',
    descriptionKey: 'assetClass.memecoinDescription',
    icon: 'Dog',
    text: 'text-asset-memecoin',
    bg: 'bg-asset-memecoin/12',
    border: 'border-asset-memecoin/30',
    activeBg: 'bg-asset-memecoin/15',
  },
  stocks: {
    labelKey: 'assetClass.stocks',
    nameKey: 'discovery.sections.stocks',
    descriptionKey: 'assetClass.stocksDescription',
    icon: 'TrendingUp',
    text: 'text-asset-stocks',
    bg: 'bg-asset-stocks/12',
    border: 'border-asset-stocks/30',
    activeBg: 'bg-asset-stocks/15',
  },
  prediction: {
    labelKey: 'assetClass.prediction',
    nameKey: 'discovery.sections.prediction',
    descriptionKey: 'assetClass.predictionDescription',
    icon: 'Vote',
    text: 'text-asset-prediction',
    bg: 'bg-asset-prediction/12',
    border: 'border-asset-prediction/30',
    activeBg: 'bg-asset-prediction/15',
  },
}

export function assetClassVisual(cls: InstrumentClass): AssetClassVisual {
  return ASSET_CLASS_VISUALS[cls]
}
