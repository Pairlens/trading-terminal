// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The icon per asset class, resolved from the name in `visuals.ts`.
 *
 * Split from the table so the table stays a pure data leaf (no lucide import,
 * testable in bun without a DOM) while the two React consumers — the badge and
 * the Discovery tabs — draw the same glyph for the same class.
 */
import {
  Bitcoin,
  Dog,
  Flame,
  Layers,
  LayoutGrid,
  TrendingUp,
  Vote,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { InstrumentClass } from '@pairlens/shared/market-ref'
import { assetClassVisual } from '@/lib/asset-class/visuals'

const BY_NAME: Record<string, LucideIcon> = {
  Bitcoin,
  Layers,
  Flame,
  Dog,
  TrendingUp,
  Vote,
}

export function assetClassIcon(cls: InstrumentClass): LucideIcon {
  return BY_NAME[assetClassVisual(cls).icon] ?? LayoutGrid
}

/** For surfaces that carry an icon name rather than a class (pane configs). */
export function iconByName(name: string): LucideIcon {
  return BY_NAME[name] ?? LayoutGrid
}
