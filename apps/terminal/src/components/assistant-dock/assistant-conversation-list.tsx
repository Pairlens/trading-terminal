// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The thread rail ──────────────────────────────────────────────────
//
// Everything the user has asked, on this device. The dock renders it
// down the left of the chat window; the phone renders the same component
// in an overlay over the Assistant tab, because a floating rail has
// nowhere to go on a 402px screen.
//
// Rows are grouped by recency rather than stamped with a time. A rail
// this narrow can show a title or a timestamp, not both, and the title
// is the part you are scanning for.
//
// A row is renamed in place: double-click it, or right-click for the
// menu. Both land on the same input drawn over the row, because a dialog
// asking for one short string is a modal too many for a rail this size.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cloud, MessagesSquare, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'

import { AssistantSyncBanner } from './assistant-sync-banner'
import type { AssistantConversationMeta } from '@/stores/assistant-conversations-store'
import {
  MAX_TITLE_CHARS,
  useAssistantConversationsStore,
} from '@/stores/assistant-conversations-store'
import {
  MASTER_DETAIL_LIST_HEADER_CLASS,
  MASTER_DETAIL_LIST_TITLE_CLASS,
} from '@/components/master-detail'
import { PANE_COLUMN_HEADER } from '@/components/panes/pane-primitives'
import { track } from '@/lib/analytics-events'
import { useCloudSyncPreferences } from '@/hooks/use-cloud-sync'
import { syncDomainDefault } from '@/lib/sync/sync-domains'

/** Which mount the rail is rendered from. Reported with every action. */
export type AssistantRailSurface = 'dock' | 'mobile'

/**
 * Day buckets, newest first. `maxAge` is calendar days back from today, so
 * a message sent twenty minutes ago at 00:10 is Yesterday, which is what
 * the person who wrote it at 23:50 would call it too. The labels are
 * catalog keys written out in full, not composed: the i18n audit reads
 * source statically.
 */
const GROUPS = [
  { id: 'today', labelKey: 'assistantDock.conversations.today', maxAge: 0 },
  {
    id: 'yesterday',
    labelKey: 'assistantDock.conversations.yesterday',
    maxAge: 1,
  },
  {
    id: 'week',
    labelKey: 'assistantDock.conversations.previous7Days',
    maxAge: 6,
  },
  { id: 'older', labelKey: 'assistantDock.conversations.older', maxAge: null },
] as const

/** Calendar days between a timestamp and today, in the viewer's own zone. */
function daysAgo(timestamp: number, now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const then = new Date(timestamp)
  then.setHours(0, 0, 0, 0)
  return Math.round((start.getTime() - then.getTime()) / 86_400_000)
}

type Group = {
  id: string
  labelKey: string
  items: Array<AssistantConversationMeta>
}

export function groupConversations(
  conversations: Array<AssistantConversationMeta>,
  now: Date = new Date(),
): Array<Group> {
  const groups: Array<Group> = GROUPS.map((group) => ({
    id: group.id,
    labelKey: group.labelKey,
    items: [],
  }))
  for (const conversation of conversations) {
    const age = daysAgo(conversation.updatedAt, now)
    const index = GROUPS.findIndex(
      (group) => group.maxAge === null || age <= group.maxAge,
    )
    groups[index === -1 ? groups.length - 1 : index].items.push(conversation)
  }
  return groups.filter((group) => group.items.length > 0)
}

export type AssistantConversationListProps = {
  /** Opens the delete dialog. Owned above so there is only ever one. */
  onRequestDelete: (id: string) => void
  /** Called after a row or the new-conversation entry is activated. */
  onNavigate?: () => void
  /** Touch targets on the phone, tighter rows in the desktop rail. */
  size?: 'sm' | 'md'
  surface?: AssistantRailSurface
}

export function AssistantConversationList({
  onRequestDelete,
  onNavigate,
  size = 'sm',
  surface = 'dock',
}: AssistantConversationListProps) {
  const { t } = useTranslation()
  const conversations = useAssistantConversationsStore(
    (state) => state.conversations,
  )
  const activeId = useAssistantConversationsStore((state) => state.activeId)
  const create = useAssistantConversationsStore((state) => state.create)
  const select = useAssistantConversationsStore((state) => state.select)
  const load = useAssistantConversationsStore((state) => state.load)
  const rename = useAssistantConversationsStore((state) => state.rename)
  const preferences = useCloudSyncPreferences()
  const syncing =
    preferences.enabled &&
    (preferences.domains.assistant ?? syncDomainDefault('assistant'))

  /** The row being renamed. One at a time, so the rail holds the id. */
  const [editingId, setEditingId] = useState<string | null>(null)

  // The rail is mounted by the dock, which sits ABOVE the capability gates:
  // it is on screen for a signed-out user whose threads are all still on
  // this device. So it reads the index itself rather than relying on the
  // chat below having done it. `load` is idempotent.
  useLayoutEffect(() => {
    load()
  }, [load])

  // Recomputed only when the list itself moves. A clock that ticked here
  // would rerender the rail once a minute for a label that changes once a
  // day.
  const groups = useMemo(
    () => groupConversations(conversations),
    [conversations],
  )

  const rowHeight = size === 'md' ? 'py-2.5' : 'py-1.5'
  const placeholder = t('assistantDock.conversations.new')

  const startNew = () => {
    setEditingId(null)
    create()
    track('assistant_conversation_action', {
      action: 'created',
      count: conversations.length + 1,
      surface,
    })
    onNavigate?.()
  }

  // An empty name clears the title rather than storing one, which puts the
  // row back on the placeholder instead of leaving a blank line in the
  // rail. Renaming to what it already said writes nothing: the index is
  // the sync payload, and a no-op write would move the thread for every
  // other device too.
  const commitRename = (id: string, raw: string) => {
    setEditingId(null)
    const current = conversations.find((meta) => meta.id === id)
    if (!current) return
    const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_CHARS)
    const next = trimmed ? trimmed : null
    if (next === current.title) return
    rename(id, next)
    track('assistant_conversation_action', {
      action: 'renamed',
      count: conversations.length,
      surface,
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* In the dock the rail is a column beside a body, which is the shape
          Bots and Indicators already have, so it wears their title row: the
          name on the left, the one action as an icon on the right. The phone
          gets the labelled button instead, because there the list IS the
          screen and a 20px plus is not a touch target. */}
      {size === 'sm' ? (
        <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
          <span className={MASTER_DETAIL_LIST_TITLE_CLASS}>
            {t('assistantDock.conversations.history')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-5 shrink-0 rounded-[6px]"
            onClick={startNew}
            aria-label={t('assistantDock.conversations.new')}
            title={t('assistantDock.conversations.new')}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="shrink-0 px-2 pt-2 pb-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 rounded-[10px] px-2 text-xs"
            onClick={startNew}
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">
              {t('assistantDock.conversations.new')}
            </span>
          </Button>
        </div>
      )}

      {conversations.length === 0 ? (
        <p className="text-muted-foreground px-3 py-2 text-[11px] leading-relaxed">
          {t('assistantDock.conversations.empty')}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {groups.map((group) => (
            <div key={group.id} className="mb-1">
              <p className={`${PANE_COLUMN_HEADER} px-2 pt-2 pb-1`}>
                {t(group.labelKey)}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeId}
                    editing={conversation.id === editingId}
                    rowHeight={rowHeight}
                    placeholder={placeholder}
                    onSelect={() => {
                      if (conversation.id !== activeId) {
                        select(conversation.id)
                        track('assistant_conversation_action', {
                          action: 'switched',
                          count: conversations.length,
                          surface,
                        })
                      }
                      onNavigate?.()
                    }}
                    onStartEdit={() => setEditingId(conversation.id)}
                    onCommitEdit={(value) =>
                      commitRename(conversation.id, value)
                    }
                    onCancelEdit={() => setEditingId(null)}
                    onRequestDelete={() => {
                      setEditingId(null)
                      onRequestDelete(conversation.id)
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AssistantSyncBanner surface={surface} />

      {/* Where these threads actually are, said out loud rather than left
          to a docs page. It tracks the switch, because a line claiming
          device-only while the account is holding a copy would be the one
          piece of copy in the app it is worst to get wrong. */}
      <p className="text-muted-foreground/70 flex shrink-0 items-center gap-1.5 px-3 py-2 text-[10px] leading-tight">
        {syncing ? (
          <Cloud className="size-3 shrink-0" />
        ) : (
          <MessagesSquare className="size-3 shrink-0" />
        )}
        <span className="min-w-0">
          {syncing
            ? t('assistantDock.conversations.synced')
            : t('assistantDock.conversations.localOnly')}
        </span>
      </p>
    </div>
  )
}

// ── One row ──────────────────────────────────────────────────────────

type ConversationRowProps = {
  conversation: AssistantConversationMeta
  active: boolean
  editing: boolean
  rowHeight: string
  /** What an unnamed thread is called, and the rename field's own hint. */
  placeholder: string
  onSelect: () => void
  onStartEdit: () => void
  onCommitEdit: (value: string) => void
  onCancelEdit: () => void
  onRequestDelete: () => void
}

function ConversationRow({
  conversation,
  active,
  editing,
  rowHeight,
  placeholder,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onRequestDelete,
}: ConversationRowProps) {
  const { t } = useTranslation()
  // A long press on a touch screen opens the menu and STILL sends a click to
  // the row when the finger lifts. On the phone that click selects the thread
  // and closes the History overlay the menu is drawn inside, so the menu dies
  // in the same gesture that opened it. The row therefore ignores a click that
  // arrives while the menu is up, or in the moment after it closes.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuClosedAt = useRef(0)

  // No menu while the field is open: right-clicking an input should give
  // the browser's own paste menu, and our Rename item would be a no-op
  // anyway. The row is a bare <li> for exactly as long as it is edited.
  if (editing) {
    return (
      <li className="relative">
        <ConversationTitleField
          initial={conversation.title ?? ''}
          placeholder={placeholder}
          className={`text-foreground bg-muted/40 ring-ring/50 w-full rounded-[10px] px-2 ${rowHeight} text-xs ring-1 outline-none`}
          label={t('assistantDock.conversations.nameLabel')}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      </li>
    )
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        setMenuOpen(open)
        if (!open) menuClosedAt.current = Date.now()
      }}
    >
      <ContextMenuTrigger className="group/row relative" render={<li />}>
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          onClick={() => {
            if (menuOpen || Date.now() - menuClosedAt.current < 400) return
            onSelect()
          }}
          onDoubleClick={onStartEdit}
          className={`ai-row text-muted-foreground hover:text-foreground aria-[current]:text-foreground flex w-full items-center gap-2 rounded-[10px] px-2 ${rowHeight} pr-7 text-left text-xs`}
        >
          <span className="min-w-0 flex-1 truncate">
            {conversation.title ?? placeholder}
          </span>
        </button>
        {/* Always reachable by keyboard, only painted on hover:
                a trash icon on every row at rest turns a quiet list
                into a wall of red. */}
        <button
          type="button"
          aria-label={t('assistantDock.conversations.delete')}
          onClick={onRequestDelete}
          className="text-muted-foreground hover:text-destructive absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      </ContextMenuTrigger>
      {/* `finalFocus={false}`: the menu hands focus back to its trigger as
          it closes, and that trigger is the row the rename field has just
          replaced. Letting it fire would blur the caret on the frame it
          appeared. */}
      <ContextMenuContent className="w-44" finalFocus={false}>
        <ContextMenuItem onClick={onStartEdit}>
          <Pencil className="size-3.5" />
          {t('assistantDock.conversations.rename')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onRequestDelete}>
          <Trash2 className="size-3.5" />
          {t('assistantDock.conversations.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * The rename field. Uncontrolled on purpose: the title is a string the
 * rail does not need to see until it is committed, and keystroke state
 * here would rerender every row in the list.
 *
 * Enter and blur commit, Escape reverts. `settled` is what keeps the blur
 * that follows Enter from committing a second time, and Escape's blur
 * from committing at all.
 */
function ConversationTitleField({
  initial,
  placeholder,
  className,
  label,
  onCommit,
  onCancel,
}: {
  initial: string
  placeholder: string
  className: string
  label: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    input.select()
    // Opened from the context menu, the caret has one competitor: whatever
    // the menu does with focus on its way out. Claiming it again on the
    // next frame costs nothing and settles that race in every browser.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        input.focus()
        input.select()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <input
      ref={ref}
      type="text"
      aria-label={label}
      defaultValue={initial}
      placeholder={placeholder}
      maxLength={MAX_TITLE_CHARS}
      className={className}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          settled.current = true
          onCommit(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          settled.current = true
          onCancel()
        }
      }}
      onBlur={(event) => {
        if (settled.current) return
        settled.current = true
        onCommit(event.currentTarget.value)
      }}
    />
  )
}

// ── The one delete dialog ────────────────────────────────────────────

/**
 * Confirm-then-delete, shared by the window header's button and every
 * row's own. Both surfaces are destroying the same kind of thing, so
 * they ask the same question in the same words, and there is exactly one
 * dialog mounted however many places can open it.
 */
export function useDeleteConversationPrompt(
  surface: AssistantRailSurface = 'dock',
): {
  requestDelete: (id: string) => void
  pendingId: string | null
  confirm: () => void
  cancel: () => void
  target: AssistantConversationMeta | null
} {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const conversations = useAssistantConversationsStore(
    (state) => state.conversations,
  )
  const remove = useAssistantConversationsStore((state) => state.remove)

  const target = pendingId
    ? (conversations.find((meta) => meta.id === pendingId) ?? null)
    : null

  return {
    pendingId,
    target,
    requestDelete: setPendingId,
    cancel: () => setPendingId(null),
    confirm: () => {
      if (pendingId) {
        remove(pendingId)
        track('assistant_conversation_action', {
          action: 'deleted',
          count: Math.max(0, conversations.length - 1),
          surface,
        })
      }
      setPendingId(null)
    },
  }
}

/**
 * The confirmation itself. Deleting a thread is not undoable and the copy
 * says so, because the button that opens it used to be a one-click
 * "clear" that took the whole conversation with it.
 */
export function AssistantDeleteConversationDialog({
  target,
  open,
  onCancel,
  onConfirm,
}: {
  target: AssistantConversationMeta | null
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('assistantDock.conversations.deleteTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('assistantDock.conversations.deleteDescription', {
              name: target?.title ?? t('assistantDock.conversations.new'),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('assistantDock.conversations.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('assistantDock.conversations.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
