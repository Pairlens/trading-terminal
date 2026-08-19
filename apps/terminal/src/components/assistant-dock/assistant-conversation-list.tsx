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

import { useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cloud, MessagesSquare, Plus, Trash2 } from 'lucide-react'

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

import { AssistantSyncBanner } from './assistant-sync-banner'
import type { AssistantConversationMeta } from '@/stores/assistant-conversations-store'
import {
  MASTER_DETAIL_LIST_HEADER_CLASS,
  MASTER_DETAIL_LIST_TITLE_CLASS,
} from '@/components/master-detail'
import { PANE_COLUMN_HEADER } from '@/components/panes/pane-primitives'
import { useAssistantConversationsStore } from '@/stores/assistant-conversations-store'
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
  const preferences = useCloudSyncPreferences()
  const syncing =
    preferences.enabled &&
    (preferences.domains.assistant ?? syncDomainDefault('assistant'))

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

  const startNew = () => {
    create()
    track('assistant_conversation_action', {
      action: 'created',
      count: conversations.length + 1,
      surface,
    })
    onNavigate?.()
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
                  <li key={conversation.id} className="group/row relative">
                    <button
                      type="button"
                      aria-current={
                        conversation.id === activeId ? 'true' : undefined
                      }
                      onClick={() => {
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
                      className={`ai-row text-muted-foreground hover:text-foreground aria-[current]:text-foreground flex w-full items-center gap-2 rounded-[10px] px-2 ${rowHeight} pr-7 text-left text-xs`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {conversation.title ??
                          t('assistantDock.conversations.untitled')}
                      </span>
                    </button>
                    {/* Always reachable by keyboard, only painted on hover:
                        a trash icon on every row at rest turns a quiet list
                        into a wall of red. */}
                    <button
                      type="button"
                      aria-label={t('assistantDock.conversations.delete')}
                      onClick={() => onRequestDelete(conversation.id)}
                      className="text-muted-foreground hover:text-destructive absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </li>
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
              name: target?.title ?? t('assistantDock.conversations.untitled'),
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
