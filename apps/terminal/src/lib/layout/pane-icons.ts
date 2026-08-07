// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ArrowUpDown,
  BookOpen,
  Brain,
  CandlestickChart,
  Flame,
  Gauge,
  Globe,
  Grid3X3,
  History,
  Info,
  Layers,
  LayoutGrid,
  Newspaper,
  PieChart,
  Plus,
  Receipt,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// A curated allowlist, not a passthrough — a plugin naming an icon we don't
// carry gets the LayoutGrid fallback rather than an arbitrary component. Every
// name a bundled pane declares in `pairlens-core` must be listed here, or that
// pane silently renders the fallback everywhere getPaneIcon is used.
const PANE_ICONS: Record<string, LucideIcon> = {
  LayoutGrid,
  Star,
  TrendingUp,
  Grid3X3,
  History,
  Newspaper,
  Gauge,
  CandlestickChart,
  ArrowUpDown,
  Brain,
  ScrollText,
  Layers,
  BookOpen,
  Receipt,
  Info,
  Search,
  Globe,
  ShieldCheck,
  Plus,
  Sparkles,
  Terminal,
  PieChart,
  Flame,
  Scale,
}

export function getPaneIcon(name?: string): LucideIcon {
  if (!name) return LayoutGrid
  return PANE_ICONS[name] ?? LayoutGrid
}
