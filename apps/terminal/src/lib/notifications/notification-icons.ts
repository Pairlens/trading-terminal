// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  ArrowUpDown,
  Bell,
  CandlestickChart,
  Clock,
  MessageSquare,
  Percent,
  Puzzle,
  ShoppingCart,
  TrendingUp,
  Webhook,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const NOTIFICATION_STEP_ICONS: Record<string, LucideIcon> = {
  // Events
  TrendingUp,
  ShoppingCart,
  Zap,
  CandlestickChart,
  // Conditions
  ArrowUpDown,
  Percent,
  Clock,
  // Channels
  MessageSquare,
  Bell,
  Webhook,
}

export function getNotificationStepIcon(name?: string): LucideIcon | null {
  if (!name) return null
  return NOTIFICATION_STEP_ICONS[name] ?? null
}

export { Puzzle as FallbackStepIcon }
