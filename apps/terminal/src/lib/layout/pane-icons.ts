// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ArrowUpDown,
  BookOpen,
  Brain,
  CandlestickChart,
  Gauge,
  Globe,
  Grid3X3,
  History,
  Info,
  Layers,
  LayoutGrid,
  Newspaper,
  Plus,
  Receipt,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
}

export function getPaneIcon(name?: string): LucideIcon {
  if (!name) return LayoutGrid
  return PANE_ICONS[name] ?? LayoutGrid
}
