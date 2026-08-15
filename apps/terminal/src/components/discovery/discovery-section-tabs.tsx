// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset-class tabs beside the Discovery title.
 *
 * Each tab is a whole workspace, so switching one is closer to changing desks
 * than to filtering a list — which is why they sit in the page header rather
 * than inside a pane, and why they can be dragged into the order a given
 * trader actually works in. A prediction-market trader who never touches perps
 * should be able to put Predictions first and forget the rest exist.
 *
 * They read as tabs but they are a group of toggle buttons, not a `tablist`.
 * Each one also carries a context menu, and Base UI's context-menu trigger
 * owns the role of whatever element it renders: composed
 * with `TabsTrigger` in either direction it produces `role="button"` children
 * inside a `role="tablist"`, which is a broken control to a screen reader. A
 * button group with `aria-pressed` describes what this actually is.
 *
 * Drag reordering carries a click-suppression ref: without it, releasing a drag
 * on the tab you started from also switches sections, which reads as the board
 * flickering for no reason.
 */
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bitcoin,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  LayoutGrid,
  TrendingUp,
  Vote,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'
import type { DragEndEvent } from '@dnd-kit/core'
import type { LucideIcon } from 'lucide-react'

import type {
  DiscoverySection,
  DiscoverySectionId,
} from '@/lib/layout/workspaces/discovery-sections'

const SECTION_ICONS: Record<string, LucideIcon> = {
  Bitcoin,
  Layers,
  Flame,
  TrendingUp,
  Vote,
}

/**
 * Segmented treatment: muted until active, a filled pill when it is.
 *
 * Not the underline the line tabs elsewhere use. The strip scrolls
 * (`overflow-x-auto`, which computes `overflow-y: auto` too), so an underline
 * hung below the tab box is clipped away and the tab you are on looks exactly
 * like the four you are not. A pill paints inside the box, so it survives.
 *
 * The active text colour has to be qualified with `dark:` as well: a bare
 * `data-active:text-foreground` loses to `dark:text-muted-foreground` in the
 * cascade, which left every tab the identical grey in the default theme.
 */
const TAB_CLASS =
  'group/section-tab relative inline-flex h-full shrink-0 cursor-grab items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none select-none active:cursor-grabbing text-foreground/60 hover:bg-muted/60 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted/30 dark:hover:text-foreground data-active:bg-muted data-active:text-foreground data-active:hover:bg-muted dark:data-active:text-foreground dark:data-active:hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50'

type DiscoverySectionTabsProps = {
  sections: Array<DiscoverySection>
  active: DiscoverySectionId
  onSelect: (id: DiscoverySectionId) => void
  onReorder: (fromId: string, toId: string) => void
}

export function DiscoverySectionTabs({
  sections,
  active,
  onSelect,
  onReorder,
}: DiscoverySectionTabsProps) {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const justDragged = useRef(false)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      justDragged.current = true
      const { active: dragged, over } = event
      if (over && dragged.id !== over.id) {
        onReorder(String(dragged.id), String(over.id))
      }
    },
    [onReorder],
  )

  // One tab is not a choice — the section strip only earns its space once the
  // install has more than one asset class in it.
  if (sections.length < 2) return null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map((s) => s.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div
          role="group"
          aria-label={t('discovery.sections.label')}
          className="flex h-7 min-w-0 items-center gap-1 overflow-x-auto"
        >
          {sections.map((section, index) => (
            <SortableSectionTab
              key={section.id}
              section={section}
              active={section.id === active}
              onSelect={() => {
                if (justDragged.current) {
                  justDragged.current = false
                  return
                }
                onSelect(section.id)
              }}
              onMove={(direction) => {
                const target = sections[index + direction]
                if (target) onReorder(section.id, target.id)
              }}
              canMoveLeft={index > 0}
              canMoveRight={index < sections.length - 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableSectionTab({
  section,
  active,
  onSelect,
  onMove,
  canMoveLeft,
  canMoveRight,
}: {
  section: DiscoverySection
  active: boolean
  onSelect: () => void
  onMove: (direction: -1 | 1) => void
  canMoveLeft: boolean
  canMoveRight: boolean
}) {
  const { t } = useTranslation()
  const {
    setNodeRef,
    listeners,
    attributes,
    isDragging,
    transform,
    transition,
  } = useSortable({ id: section.id })
  const Icon = SECTION_ICONS[section.icon] ?? LayoutGrid

  return (
    <ContextMenu>
      {/* The trigger wraps the button rather than BEING it. Base UI's
          context-menu trigger owns the role and the aria state of whatever
          element it renders, so rendering it AS the tab silently dropped
          `aria-pressed` and reported every tab as a plain button. A
          `display: contents` span changes no layout and leaves the button's
          semantics alone. */}
      <ContextMenuTrigger render={<span className="contents" />}>
        <button
          type="button"
          ref={setNodeRef}
          // The sortable attributes go FIRST: dnd-kit sets its own
          // `aria-pressed` (undefined unless the item is mid-drag), which
          // silently erased the one that says which section is open. Its
          // keyboard handler is likewise inert here, since this strip drags
          // with a pointer and reorders with Alt+Arrow.
          {...attributes}
          {...listeners}
          data-section-tab={section.id}
          aria-pressed={active}
          data-active={active ? '' : undefined}
          className={TAB_CLASS}
          style={{
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.3 : 1,
          }}
          onClick={onSelect}
          // Keyboard reordering, since a drag is not available without a
          // pointer and the context menu is the only other way to move a tab.
          onKeyDown={(event) => {
            if (!event.altKey) return
            if (event.key === 'ArrowLeft' && canMoveLeft) {
              event.preventDefault()
              onMove(-1)
            } else if (event.key === 'ArrowRight' && canMoveRight) {
              event.preventDefault()
              onMove(1)
            }
          }}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        >
          <Icon className="size-3.5 shrink-0" />
          {t(section.labelKey)}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={!canMoveLeft} onClick={() => onMove(-1)}>
          <ChevronLeft className="size-3.5" />
          {t('discovery.sections.moveLeft')}
        </ContextMenuItem>
        <ContextMenuItem disabled={!canMoveRight} onClick={() => onMove(1)}>
          <ChevronRight className="size-3.5" />
          {t('discovery.sections.moveRight')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
