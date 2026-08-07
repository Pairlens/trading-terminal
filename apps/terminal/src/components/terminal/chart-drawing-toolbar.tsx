// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'

import {
  ChevronDown,
  Eraser,
  History,
  MousePointer2,
  Pin,
  PinOff,
  Redo2,
  Star,
  Undo2,
} from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { Separator } from '@pairlens/ui/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { cn } from '@pairlens/ui/lib/utils'
import {
  TOOL_CATEGORIES,
  findDrawingTool,
  toolKey,
} from './drawing-tool-catalog'
import type {
  DrawingToolMode,
  DrawingToolType,
} from '@pairlens/fast-financial-charts/types'
import type { DrawingToolOption, ToolCategory } from './drawing-tool-catalog'
import { ShortcutHint } from '@/components/shortcut-hints'
import {
  useKeybindingLabel,
  useKeybindingLabels,
} from '@/hooks/use-keybindings'
import { drawingToolCommandId } from '@/lib/keybindings/commands'
import { usePersistedState } from '@/hooks/use-persisted-state'
import {
  drawingToolKey,
  useDrawingFavorites,
  useDrawingRecents,
} from '@/lib/chart-drawing-tools'

type ChartDrawingToolbarProps = {
  activeTool: DrawingToolType | null
  activeToolMeta?: Record<string, unknown> | null
  toolMode: DrawingToolMode
  onToolChange: (
    tool: DrawingToolType | null,
    meta?: Record<string, unknown>,
  ) => void
  onToolModeChange: (mode: DrawingToolMode) => void
  onClearAll: () => void
  onClearDrawings: () => void
  onClearIndicators: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

type ShelfProps = {
  activeToolKey: string | null
  isFavorite: (key: string) => boolean
  onToggleFavorite: (key: string) => void
  onToolChange: (tool: DrawingToolType, meta?: Record<string, unknown>) => void
}

/**
 * One named row inside a flyout: pick the tool, or pin it.
 *
 * The star is a sibling button rather than something layered on the row —
 * a button inside a button is invalid, and the two do different things.
 */
function ToolRow({
  option,
  activeToolKey,
  shortcut,
  isFavorite,
  onToggleFavorite,
  onSelect,
}: {
  option: DrawingToolOption
  activeToolKey: string | null
  shortcut: string
  isFavorite: boolean
  onToggleFavorite: (key: string) => void
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const key = toolKey(option)

  return (
    <div className="flex items-center gap-0.5">
      <Button
        size="sm"
        variant={key === activeToolKey ? 'default' : 'ghost'}
        className="flex-1 justify-start gap-2 px-2 text-xs"
        onClick={onSelect}
      >
        <option.icon className="size-3.5" />
        {t(option.labelKey)}
        {shortcut ? (
          <Kbd className="ml-auto text-[10px]">{shortcut}</Kbd>
        ) : null}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-6 shrink-0"
        onClick={() => onToggleFavorite(key)}
        aria-label={
          isFavorite
            ? t('chart.drawing.removeFromFavorites')
            : t('chart.drawing.addToFavorites')
        }
      >
        <Star
          className={cn(
            'size-3',
            isFavorite
              ? 'fill-primary text-primary'
              : 'text-muted-foreground/60',
          )}
        />
      </Button>
    </div>
  )
}

/**
 * Pinned tools, above the categories.
 *
 * Right-click unpins: the rail is 40px wide, so an always-visible remove
 * affordance would crowd out the icon it belongs to.
 */
function FavoritesSection({
  favorites,
  activeToolKey,
  onToggleFavorite,
  onToolChange,
}: {
  favorites: Array<string>
} & Omit<ShelfProps, 'isFavorite'>) {
  const { t } = useTranslation()
  const keybindingLabel = useKeybindingLabels()

  // A key can outlive the tool it names (a build that drops a tool, a list
  // synced from a newer version) — those are skipped, not rendered blank.
  const options = favorites
    .map((key) => ({ key, option: findDrawingTool(key) }))
    .filter((entry): entry is { key: string; option: DrawingToolOption } =>
      Boolean(entry.option),
    )

  if (options.length === 0) return null

  return (
    <>
      {options.map(({ key, option }) => {
        const shortcut = keybindingLabel(drawingToolCommandId(option.tool))
        return (
          <ContextMenu key={key}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ContextMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant={key === activeToolKey ? 'default' : 'ghost'}
                        className="size-7"
                        onClick={() => onToolChange(option.tool, option.meta)}
                        aria-label={t(option.labelKey)}
                      />
                    }
                  />
                }
              >
                <option.icon className="size-3.5" />
                <ShortcutHint keys={shortcut} />
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                {t(option.labelKey)}
                {shortcut ? <Kbd className="ml-1">{shortcut}</Kbd> : null}
              </TooltipContent>
            </Tooltip>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onToggleFavorite(key)}>
                <Star className="size-3.5" />
                {t('chart.drawing.removeFromFavorites')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
      <Separator className="my-1 w-6" />
    </>
  )
}

/** Last few tools used, from any source — the rail, a chord, the copilot. */
function RecentsMenu({
  activeToolKey,
  isFavorite,
  onToggleFavorite,
  onToolChange,
}: ShelfProps) {
  const { t } = useTranslation()
  const keybindingLabel = useKeybindingLabels()
  const recents = useDrawingRecents()
  const [open, setOpen] = useState(false)

  const options = recents
    .map((key) => findDrawingTool(key))
    .filter((option): option is DrawingToolOption => Boolean(option))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label={t('chart.drawing.recentTools')}
                />
              }
            />
          }
        >
          <History className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="right">
          {t('chart.drawing.recentTools')}
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-auto p-1">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            {t('chart.drawing.noRecentTools')}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {options.map((option) => {
              const key = toolKey(option)
              return (
                <ToolRow
                  key={key}
                  option={option}
                  activeToolKey={activeToolKey}
                  shortcut={keybindingLabel(drawingToolCommandId(option.tool))}
                  isFavorite={isFavorite(key)}
                  onToggleFavorite={onToggleFavorite}
                  onSelect={() => {
                    onToolChange(option.tool, option.meta)
                    setOpen(false)
                  }}
                />
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function CategoryGroup({
  category,
  activeToolKey,
  isFavorite,
  onToggleFavorite,
  onToolChange,
}: { category: ToolCategory } & ShelfProps) {
  const { t } = useTranslation()
  const keybindingLabel = useKeybindingLabels()
  const shortcutFor = (option: DrawingToolOption) =>
    keybindingLabel(drawingToolCommandId(option.tool))
  const [lastUsedKey, setLastUsedKey] = usePersistedState<string>(
    category.persistKey,
    toolKey(category.tools[0]),
  )
  const [open, setOpen] = useState(false)

  const lastUsedTool =
    category.tools.find((o) => toolKey(o) === lastUsedKey) ?? category.tools[0]
  const activeOption = activeToolKey
    ? category.tools.find((o) => toolKey(o) === activeToolKey)
    : undefined
  const isActive = !!activeOption
  const displayTool = activeOption ?? lastUsedTool
  const Icon = displayTool.icon

  // Single tool in category — no flyout needed
  if (category.tools.length === 1) {
    const tool = category.tools[0]
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={toolKey(tool) === activeToolKey ? 'default' : 'ghost'}
              className="size-7"
              onClick={() => onToolChange(tool.tool, tool.meta)}
              aria-label={t(tool.labelKey)}
            />
          }
        >
          <tool.icon className="size-3.5" />
          <ShortcutHint keys={shortcutFor(tool)} />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {t(tool.labelKey)}
          {shortcutFor(tool) ? (
            <Kbd className="ml-1">{shortcutFor(tool)}</Kbd>
          ) : null}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={isActive ? 'default' : 'ghost'}
                className="size-7 rounded-r-none pr-0"
                onClick={() => {
                  onToolChange(displayTool.tool, displayTool.meta)
                  setLastUsedKey(toolKey(displayTool))
                }}
                aria-label={t(displayTool.labelKey)}
              />
            }
          >
            <Icon className="size-3.5" />
            <ShortcutHint keys={shortcutFor(displayTool)} />
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t(displayTool.labelKey)}
            {shortcutFor(displayTool) ? (
              <Kbd className="ml-1">{shortcutFor(displayTool)}</Kbd>
            ) : null}
          </TooltipContent>
        </Tooltip>
        <PopoverTrigger
          render={
            <Button
              size="icon-sm"
              variant={isActive ? 'default' : 'ghost'}
              className="size-7 w-3 rounded-l-none pl-0"
              aria-label={t(category.labelKey)}
            />
          }
        >
          <ChevronDown className="size-2.5" />
        </PopoverTrigger>
      </div>
      <PopoverContent side="right" align="start" className="w-auto p-1">
        <div className="flex flex-col gap-0.5">
          {category.tools.map((option) => (
            <ToolRow
              key={toolKey(option)}
              option={option}
              activeToolKey={activeToolKey}
              shortcut={shortcutFor(option)}
              isFavorite={isFavorite(toolKey(option))}
              onToggleFavorite={onToggleFavorite}
              onSelect={() => {
                onToolChange(option.tool, option.meta)
                setLastUsedKey(toolKey(option))
                setOpen(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ChartDrawingToolbar({
  activeTool,
  activeToolMeta,
  toolMode,
  onToolChange,
  onToolModeChange,
  onClearAll,
  onClearDrawings,
  onClearIndicators,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ChartDrawingToolbarProps) {
  const { t } = useTranslation()
  const undoShortcut = useKeybindingLabel('chart.undo')
  const redoShortcut = useKeybindingLabel('chart.redo')
  const [favorites, toggleFavorite, isFavorite] = useDrawingFavorites()
  const StickyModeIcon = toolMode === 'sticky' ? Pin : PinOff
  const activeToolKey = activeTool
    ? drawingToolKey(activeTool, activeToolMeta)
    : null

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r py-2">
      {/* Select / Pan */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={activeTool === null ? 'default' : 'ghost'}
              className="size-7"
              onClick={() => onToolChange(null)}
              aria-label={t('chart.drawing.selectPan')}
            />
          }
        >
          <MousePointer2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {t('chart.drawing.selectPan')}
          <Kbd className="ml-1">Esc</Kbd>
        </TooltipContent>
      </Tooltip>

      <RecentsMenu
        activeToolKey={activeToolKey}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onToolChange={onToolChange}
      />

      <Separator className="my-1 w-6" />

      {/* Favorites + category groups. Scrolls on its own so a short pane keeps
          the clear/undo block reachable instead of pushing it past the bottom
          edge, where it used to be clipped away entirely. The bar stays hidden:
          a platform gutter is 8-11px of a 40px rail, which would knock every
          icon off-centre on Windows to say what the wheel already does. */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain">
        <FavoritesSection
          favorites={favorites}
          activeToolKey={activeToolKey}
          onToggleFavorite={toggleFavorite}
          onToolChange={onToolChange}
        />
        {TOOL_CATEGORIES.map((category) => (
          <CategoryGroup
            key={category.id}
            category={category}
            activeToolKey={activeToolKey}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onToolChange={onToolChange}
          />
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-0.5">
        <Separator className="mb-1 w-6" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label={t('chart.drawing.clearMenu', 'Clear…')}
                    />
                  }
                />
              }
            >
              <Eraser className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="right">
              {t('chart.drawing.clearMenu', 'Clear…')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={onClearDrawings}>
              {t('chart.drawing.clearDrawings', 'Clear drawings')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClearIndicators}>
              {t('chart.drawing.clearIndicators', 'Clear indicators')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClearAll}>
              {t('chart.drawing.clearAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={toolMode === 'sticky' ? 'default' : 'ghost'}
                className="size-7"
                onClick={() =>
                  onToolModeChange(
                    toolMode === 'sticky' ? 'single-use' : 'sticky',
                  )
                }
                aria-label={
                  toolMode === 'sticky'
                    ? t('chart.drawing.stickyEnabled')
                    : t('chart.drawing.singleUseEnabled')
                }
              />
            }
          >
            <StickyModeIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="right">
            {toolMode === 'sticky'
              ? t('chart.drawing.stickyTools')
              : t('chart.drawing.singleUseTools')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7"
                disabled={!canUndo}
                onClick={onUndo}
                aria-label={t('chart.drawing.undo')}
              />
            }
          >
            <Undo2 className="size-3.5" />
            <ShortcutHint keys={undoShortcut} />
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t('chart.drawing.undo')}
            {undoShortcut ? <Kbd className="ml-1">{undoShortcut}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7"
                disabled={!canRedo}
                onClick={onRedo}
                aria-label={t('chart.drawing.redo')}
              />
            }
          >
            <Redo2 className="size-3.5" />
            <ShortcutHint keys={redoShortcut} />
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t('chart.drawing.redo')}
            {redoShortcut ? <Kbd className="ml-1">{redoShortcut}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
