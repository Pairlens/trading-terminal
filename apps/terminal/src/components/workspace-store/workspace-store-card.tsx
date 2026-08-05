// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Download, Heart, Sparkles, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { POSTER_MORPH } from '../store/store-shell'

import { WorkspaceLayoutPreview } from './workspace-layout-preview'
import type { TemplateReadiness } from '@/lib/workspace-store/dependency-analysis'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import {
  templateName,
  templateTagline,
} from '@/lib/workspace-store/template-labels'

const READINESS_DOT: Record<
  TemplateReadiness,
  { className: string; key: string; fallback: string }
> = {
  ready: {
    className: 'bg-[var(--chart-2)]',
    key: 'workspaceStore.readinessDot.ready',
    fallback: 'Ready to use',
  },
  'needs-enable': {
    className: 'bg-amber-500',
    key: 'workspaceStore.readinessDot.needsEnable',
    fallback: 'Some plugins disabled',
  },
  'needs-install': {
    className: 'bg-sky-500',
    key: 'workspaceStore.readinessDot.needsInstall',
    fallback: 'Needs extra plugins',
  },
}

type Props = {
  template: WorkspaceTemplate
  readiness: TemplateReadiness
  onSelect: () => void
  /** When true, the fav count is an interactive toggle. */
  canFavorite?: boolean
  favoritePending?: boolean
  onToggleFavorite?: () => void
  /** Shared-element id — the poster morphs into the product-page schematic. */
  layoutId?: string
}

/**
 * Poster-style template card — the workspace-store sibling of the plugin
 * poster card. The layout schematic is the poster art; name + tagline sit
 * below, and community meta lines the poster's bottom edge.
 */
export function WorkspaceStoreCard({
  template,
  readiness,
  onSelect,
  canFavorite,
  favoritePending,
  onToggleFavorite,
  layoutId,
}: Props) {
  const { t } = useTranslation()
  const dot = READINESS_DOT[readiness]
  const isCommunity = template.origin === 'community'
  const faved = template.community?.faved ?? false
  const favorites = template.community?.favorites ?? 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className="pl-store-lift w-[236px] shrink-0 cursor-pointer text-left focus-visible:outline-none focus-visible:[&>div:first-child]:ring-2 focus-visible:[&>div:first-child]:ring-ring"
    >
      <motion.div
        layoutId={layoutId}
        transition={POSTER_MORPH}
        className="relative h-[172px] overflow-hidden border border-border bg-gradient-to-br from-primary/[0.07] via-card to-card p-3"
        style={{ borderRadius: 17 }}
      >
        <WorkspaceLayoutPreview layout={template.layout} className="h-full" />
        {template.featured && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-amber-500 backdrop-blur-sm">
            <Sparkles className="size-2.5" />
            {t('workspaceStore.featuredBadge', 'Featured')}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  'absolute bottom-2.5 right-3 size-2 rounded-full',
                  dot.className,
                )}
              />
            }
          />
          <TooltipContent>{t(dot.key, dot.fallback)}</TooltipContent>
        </Tooltip>
        {isCommunity && (
          <div className="absolute bottom-2 left-3 flex items-center gap-2.5 text-[10px] text-muted-foreground">
            <span className="inline-flex max-w-[90px] items-center gap-1">
              <Users className="size-3 shrink-0" />
              <span className="truncate">{template.author}</span>
            </span>
            <span
              className="inline-flex items-center gap-1"
              title={t('workspaceStore.community.downloads', 'Downloads')}
            >
              <Download className="size-3" />
              {template.community?.installs ?? 0}
            </span>
            {canFavorite ? (
              <button
                type="button"
                disabled={favoritePending}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite?.()
                }}
                aria-pressed={faved}
                aria-label={t('workspaceStore.community.favorite', 'Favorite')}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted disabled:opacity-50',
                  faved && 'text-rose-500',
                )}
              >
                <Heart className={cn('size-3', faved && 'fill-current')} />
                {favorites}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1"
                title={t('workspaceStore.community.favorites', 'Favorites')}
              >
                <Heart className="size-3" />
                {favorites}
              </span>
            )}
          </div>
        )}
      </motion.div>
      <p className="mt-2 truncate text-[13px] font-semibold text-foreground">
        {templateName(t, template)}
      </p>
      <p className="truncate text-[11px] text-muted-foreground/80">
        {templateTagline(t, template)}
      </p>
    </div>
  )
}
