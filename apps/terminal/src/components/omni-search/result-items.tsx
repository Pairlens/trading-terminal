// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Fragment, memo } from 'react'
import {
  AppWindow,
  ArrowLeftRight,
  Bell,
  Blocks,
  Bot,
  Check,
  CircleUser,
  Cloud,
  Coins,
  FileText,
  Gauge,
  Globe,
  Home,
  Keyboard,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Maximize,
  Moon,
  Paintbrush,
  Palette,
  Plus,
  Puzzle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  SquarePlus,
  Star,
  Store,
  Sun,
  Terminal,
  Wallet,
  Waypoints,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { CommandItem } from '@pairlens/ui/components/ui/command'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'

import type {
  ActionResult,
  MarketResult,
  MatchRanges,
  NotificationResult,
  PageResult,
  PairResult,
  PaneResult,
  PluginResult,
  WorkflowResult,
  WorkspaceResult,
} from './omni-search-types'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { ASSET_CLASS_LABELS } from '@/components/terminal/market-picker'
import { getWorkspaceIcon } from '@/components/workspace/workspace-icons'
import { getPaneIcon } from '@/lib/layout/pane-icons'

// ── Icon map for pages and actions ──────────────────────────────────

const PAGE_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/plugins': Blocks,
  '/accounts': Wallet,
  '/workflows': Waypoints,
  '/bots': Bot,
  '/notifications': Bell,
  '/workspace-store': Store,
}

// Keyed by action id first, then by icon name (both are tried).
const ACTION_ICONS: Record<string, LucideIcon> = {
  'toggle-theme': Sun,
  'toggle-theme-dark': Moon,
  'open-settings': Settings2,
  'new-window': AppWindow,
  'reload-window': RefreshCw,
  'toggle-fullscreen': Maximize,
  'sign-out': LogOut,
  Sun,
  Moon,
  Settings2,
  AppWindow,
  RefreshCw,
  LogOut,
  Palette,
  Terminal,
  SquarePlus,
  CircleUser,
  Puzzle,
  MapPin,
  Coins,
  ShieldCheck,
  ShieldOff,
  Paintbrush,
  Keyboard,
  Gauge,
  Globe,
  Lock,
  Cloud,
  Sparkles,
  Maximize,
}

// ── Match highlighting ──────────────────────────────────────────────

/**
 * Renders `text` with fuzzy-match ranges emphasized. Matched characters
 * take the primary color so the eye lands on why a result is here.
 */
export function HighlightedText({
  text,
  ranges,
}: {
  text: string
  ranges?: MatchRanges
}) {
  if (!ranges || ranges.length === 0) return <>{text}</>
  const parts: Array<React.ReactNode> = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) {
      parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>)
    }
    parts.push(
      <span key={`m${i}`} className="text-primary">
        {text.slice(start, end)}
      </span>,
    )
    cursor = end
  })
  if (cursor < text.length) {
    parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)
  }
  return <>{parts}</>
}

// ── Shared row + icon-tile styling ──────────────────────────────────

// Selected row: soft accent fill + inset primary left bar + lg radius.
// The inset bar is scoped to the selected state so idle rows stay clean.
const ROW_CLASS =
  'rounded-lg! data-[selected=true]:bg-accent data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)]'

// 22px rounded icon tile that seats a lucide glyph.
function IconTile({
  icon: Icon,
  active,
}: {
  icon: LucideIcon
  active?: boolean
}) {
  return (
    <span
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-md',
        active ? 'text-primary' : 'bg-secondary text-muted-foreground',
      )}
      style={
        active
          ? {
              backgroundColor:
                'color-mix(in oklch, var(--primary) 22%, var(--secondary))',
            }
          : undefined
      }
    >
      <Icon className="size-3.5" />
    </span>
  )
}

// ── Pair result ─────────────────────────────────────────────────────

export const PairResultItem = memo(function PairResultItem({
  result,
  onSelect,
}: {
  result: PairResult
  onSelect: () => void
}) {
  const { pair, isWatched } = result
  return (
    <CommandItem
      value={`pair:${pair.symbol}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <PairLogo
        base={pair.base}
        quote={pair.quote}
        assetClass={pair.assetClass}
        size="sm"
      />
      <PairSymbol symbol={pair.symbol} className="text-sm" />
      <span className="flex-1 truncate text-xs text-muted-foreground">
        {pair.name}
      </span>
      {isWatched && (
        <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
      )}
    </CommandItem>
  )
})

// ── Market (venue) result ───────────────────────────────────────────

export const MarketResultItem = memo(function MarketResultItem({
  result,
  onSelect,
}: {
  result: MarketResult
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const classLabel = result.assetClass
    ? ASSET_CLASS_LABELS[result.assetClass]
    : null

  return (
    <CommandItem
      value={`market:${result.marketId}`}
      onSelect={onSelect}
      className={cn(ROW_CLASS, 'group/market')}
    >
      {result.iconUrl ? (
        <img
          src={result.iconUrl}
          alt=""
          className="size-[22px] shrink-0 rounded-md"
        />
      ) : (
        <IconTile icon={Landmark} active={result.isActive} />
      )}
      <span className="text-sm">
        <HighlightedText text={result.label} ranges={result.matchRanges} />
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {/* This venue serves no CORS headers and streams no candle history,
            so a browser build cannot read it — same mark as the venue
            dropdown, said before the click rather than after. */}
        {result.requiresDesktop && (
          <span className="rounded-sm border border-border/60 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Desktop
          </span>
        )}
        {classLabel && (
          <Badge
            variant="secondary"
            className="font-mono text-[10px] tracking-wide group-data-[selected=true]/market:hidden"
          >
            {classLabel}
          </Badge>
        )}
        {result.isActive ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="size-3" />
            {t('search.marketActive')}
          </span>
        ) : (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground group-data-[selected=true]/market:flex">
            <ArrowLeftRight className="size-3" />
            {t('search.switchMarket')}
          </span>
        )}
      </span>
    </CommandItem>
  )
})

// ── Page result ─────────────────────────────────────────────────────

export const PageResultItem = memo(function PageResultItem({
  result,
  onSelect,
}: {
  result: PageResult
  onSelect: () => void
}) {
  const Icon = PAGE_ICONS[result.path] ?? FileText
  return (
    <CommandItem
      value={`page:${result.id}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <IconTile icon={Icon} />
      <span className="text-sm">
        <HighlightedText text={result.name} ranges={result.matchRanges} />
      </span>
    </CommandItem>
  )
})

// ── Workspace result ────────────────────────────────────────────────

export const WorkspaceResultItem = memo(function WorkspaceResultItem({
  result,
  onSelect,
}: {
  result: WorkspaceResult
  onSelect: () => void
}) {
  const WsIcon = getWorkspaceIcon(result.icon)
  return (
    <CommandItem
      value={`workspace:${result.id}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <IconTile icon={WsIcon} />
      <span className="text-sm">
        <HighlightedText text={result.name} ranges={result.matchRanges} />
      </span>
      {result.description && (
        <span className="text-xs text-muted-foreground">
          {result.description}
        </span>
      )}
    </CommandItem>
  )
})

// ── Workflow result ─────────────────────────────────────────────────

export const WorkflowResultItem = memo(function WorkflowResultItem({
  result,
  onSelect,
}: {
  result: WorkflowResult
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`workflow:${result.id}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <IconTile icon={Waypoints} />
      <span className="text-sm">
        <HighlightedText text={result.name} ranges={result.matchRanges} />
      </span>
      {result.description && (
        <span className="text-xs text-muted-foreground">
          {result.description}
        </span>
      )}
    </CommandItem>
  )
})

// ── Notification result ────────────────────────────────────────────

export const NotificationResultItem = memo(function NotificationResultItem({
  result,
  onSelect,
}: {
  result: NotificationResult
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`notification:${result.id}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <IconTile icon={Bell} />
      <span className="text-sm">
        <HighlightedText text={result.name} ranges={result.matchRanges} />
      </span>
    </CommandItem>
  )
})

// ── Pane result ─────────────────────────────────────────────────────

export const PaneResultItem = memo(function PaneResultItem({
  result,
  onSelect,
}: {
  result: PaneResult
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const categoryLabel = result.category
    ? t(
        `paneCategories.${result.category === 'ai-research' ? 'aiResearch' : result.category}`,
      )
    : null

  return (
    <CommandItem
      value={`pane:${result.paneType}`}
      onSelect={onSelect}
      className={cn(ROW_CLASS, 'group/pane')}
    >
      <IconTile icon={getPaneIcon(result.icon)} />
      <span className="text-sm">
        <HighlightedText text={result.label} ranges={result.matchRanges} />
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {categoryLabel && (
          <Badge
            variant="secondary"
            className="font-mono text-[10px] tracking-wide group-data-[selected=true]/pane:hidden"
          >
            {categoryLabel}
          </Badge>
        )}
        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground group-data-[selected=true]/pane:flex">
          <Plus className="size-3" />
          {t('search.addPane')}
        </span>
      </span>
    </CommandItem>
  )
})

// ── Plugin result ───────────────────────────────────────────────────

export const PluginResultItem = memo(function PluginResultItem({
  result,
  onSelect,
}: {
  result: PluginResult
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`plugin:${result.id}`}
      onSelect={onSelect}
      className={cn(ROW_CLASS, 'min-w-0')}
    >
      <IconTile icon={Blocks} />
      <span className="shrink-0 truncate text-sm" style={{ maxWidth: '40%' }}>
        <HighlightedText text={result.name} ranges={result.matchRanges} />
      </span>
      {result.description && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {result.description}
        </span>
      )}
      {result.enabled && (
        <Badge
          variant="secondary"
          className="shrink-0 font-mono text-[10px] tracking-wide"
        >
          Active
        </Badge>
      )}
    </CommandItem>
  )
})

// ── Action result ───────────────────────────────────────────────────

export const ActionResultItem = memo(function ActionResultItem({
  result,
  onSelect,
}: {
  result: ActionResult
  onSelect: () => void
}) {
  const Icon = ACTION_ICONS[result.id] ?? ACTION_ICONS[result.icon] ?? Globe
  return (
    <CommandItem
      value={`action:${result.id}`}
      onSelect={onSelect}
      className={ROW_CLASS}
    >
      <IconTile icon={Icon} />
      <span className="text-sm">
        <HighlightedText text={result.label} ranges={result.matchRanges} />
      </span>
      {result.shortcut && (
        <Kbd className="ml-auto text-[10px]">{result.shortcut}</Kbd>
      )}
    </CommandItem>
  )
})
