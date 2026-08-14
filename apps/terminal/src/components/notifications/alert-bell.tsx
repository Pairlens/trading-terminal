// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bell over the chart: what is armed on this pair, and what has fired.
 *
 * It used to be a menu of rule names with checkmarks — a binding editor and
 * nothing else, which meant the terminal could notify you and then offer no
 * way to look at what it said. Alerts you set and alerts that fired are the
 * same question asked in two tenses, so they live behind the same bell:
 * Armed lists what is watching this pair, Activity lists what it caught, and
 * "See all" opens the full history in a sheet.
 *
 * Pair-scoped throughout. The switch on an armed row toggles the BINDING,
 * not the rule — a level alert watching three venues should not go dark
 * everywhere because it was silenced here.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronRight, Plus, Settings2, Workflow } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { Switch } from '@pairlens/ui/components/ui/switch'

import { isSimpleAlert } from '@pairlens/notification-engine/simple-alerts'

import { NewAlertDialog } from './new-alert-dialog'
import { NotificationActivityList } from './notification-activity'
import { NotificationHistorySheet } from './notification-history-sheet'

import {
  selectUnreadCount,
  useNotificationLogStore,
} from '@/stores/notification-log-store'
import { useNotificationStore } from '@/stores/notification-store'

/** Recent firings shown inline. Enough to answer "did I miss something?". */
const INLINE_ACTIVITY = 5

type AlertBellProps = {
  pairKey: string
  market: string
}

export function AlertBell({ pairKey, market }: AlertBellProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const rules = useNotificationStore((s) => s.rules)
  const bindings = useNotificationStore((s) => s.bindings)
  const addBinding = useNotificationStore((s) => s.addBinding)
  const toggleBinding = useNotificationStore((s) => s.toggleBinding)
  const selectRule = useNotificationStore((s) => s.selectRule)
  const startEditing = useNotificationStore((s) => s.startEditing)

  const entries = useNotificationLogStore((s) => s.entries)
  const loadLog = useNotificationLogStore((s) => s.load)
  const markSeen = useNotificationLogStore((s) => s.markSeen)
  const unread = useNotificationLogStore(selectUnreadCount)

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'armed' | 'activity'>('armed')
  const [alertOpen, setAlertOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    loadLog()
  }, [loadLog])

  // Opening on unread lands on what is new; otherwise on what is watching.
  // `unread` is read through a ref so it is sampled once per open: switching
  // tabs under the user because an alert fired mid-session would be worse
  // than the badge they can already see.
  const unreadRef = useRef(unread)
  unreadRef.current = unread
  useEffect(() => {
    if (open) setTab(unreadRef.current > 0 ? 'activity' : 'armed')
  }, [open])

  useEffect(() => {
    if (open && tab === 'activity') markSeen()
  }, [open, tab, entries, markSeen])

  const { armed, available } = useMemo(() => {
    const here = new Map(
      bindings
        .filter((b) => b.pair === pairKey && (!b.market || b.market === market))
        .map((b) => [b.ruleId, b]),
    )
    return {
      armed: rules
        .filter((rule) => here.has(rule.id))
        .map((rule) => ({ rule, binding: here.get(rule.id)! })),
      available: rules.filter((rule) => !here.has(rule.id)),
    }
  }, [rules, bindings, pairKey, market])

  const openRule = (ruleId: string) => {
    selectRule(ruleId)
    startEditing(ruleId)
    setOpen(false)
    void navigate({ to: '/notifications' })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="relative size-6"
              aria-label={t('terminal.createAlert')}
            />
          }
        >
          <Bell
            className={cn(
              'size-3.5',
              armed.length > 0
                ? 'fill-primary text-primary'
                : 'text-muted-foreground',
            )}
          />
          {unread > 0 && (
            <span
              className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary ring-2 ring-background"
              aria-label={t('notifications.bell.unread', { count: unread })}
            />
          )}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[320px] p-0">
          {/* Tabs — same two words the Notifications page uses. */}
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            {(['armed', 'activity'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                  tab === id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(id)}
              >
                {id === 'armed'
                  ? t('notifications.bell.tabArmed')
                  : t('notifications.bell.tabActivity')}
                {id === 'activity' && unread > 0 && (
                  <span className="ml-1 text-primary">{unread}</span>
                )}
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-6"
              aria-label={t('notifications.bell.manage')}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/notifications' })
              }}
            >
              <Settings2 className="size-3.5" />
            </Button>
          </div>

          {tab === 'armed' ? (
            <ArmedTab
              pairKey={pairKey}
              armed={armed}
              available={available}
              onToggleBinding={toggleBinding}
              onAttach={(ruleId) => addBinding(ruleId, pairKey, market)}
              onOpenRule={openRule}
            />
          ) : (
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              <NotificationActivityList
                entries={entries.slice(0, INLINE_ACTIVITY)}
                compact
                emptyLabel={t('notifications.bell.noActivityYet')}
              />
              {entries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 w-full justify-between px-2 text-[11px] text-muted-foreground"
                  onClick={() => {
                    setOpen(false)
                    setHistoryOpen(true)
                  }}
                >
                  {t('notifications.bell.seeAll', { count: entries.length })}
                  <ChevronRight className="size-3.5" />
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 border-t border-border p-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 text-[11px]"
              onClick={() => {
                setOpen(false)
                setAlertOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {t('notifications.simple.newTitle')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('notifications.newFlow')}
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/notifications' })
              }}
            >
              <Workflow className="size-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <NewAlertDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        defaultPair={pairKey}
        defaultMarket={market}
      />
      <NotificationHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  )
}

// ── Armed tab ────────────────────────────────────────────────────────

function ArmedTab({
  pairKey,
  armed,
  available,
  onToggleBinding,
  onAttach,
  onOpenRule,
}: {
  pairKey: string
  armed: Array<{
    rule: { id: string; name: string; enabled?: boolean }
    binding: { id: string; enabled: boolean }
  }>
  available: Array<{ id: string; name: string }>
  onToggleBinding: (bindingId: string) => void
  onAttach: (ruleId: string) => void
  onOpenRule: (ruleId: string) => void
}) {
  const { t } = useTranslation()
  const rules = useNotificationStore((s) => s.rules)

  const iconFor = (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId)
    return rule && isSimpleAlert(rule) ? Bell : Workflow
  }

  return (
    <div className="max-h-[320px] overflow-y-auto p-1.5">
      <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {t('notifications.bell.onPair', { pair: pairKey })}
      </p>

      {armed.length === 0 && (
        <p className="px-1.5 pb-2 text-[11px] text-muted-foreground">
          {t('notifications.bell.nothingArmed')}
        </p>
      )}

      {armed.map(({ rule, binding }) => {
        const RowIcon = iconFor(rule.id)
        // The rule's own kill switch wins over the binding's: a disabled rule
        // cannot fire here no matter what this row says, so say so.
        const off = rule.enabled === false || !binding.enabled
        return (
          <div
            key={rule.id}
            className={cn(
              'group flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted',
              off && 'opacity-60',
            )}
          >
            <RowIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left font-mono"
              onClick={() => onOpenRule(rule.id)}
              title={rule.name}
            >
              {rule.name}
            </button>
            <Switch
              className="scale-[0.7]"
              checked={binding.enabled && rule.enabled !== false}
              disabled={rule.enabled === false}
              onCheckedChange={() => onToggleBinding(binding.id)}
            />
          </div>
        )
      })}

      {available.length > 0 && (
        <>
          <p className="px-1.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('notifications.bell.alsoWatch')}
          </p>
          {available.map((rule) => {
            const RowIcon = iconFor(rule.id)
            return (
              <button
                key={rule.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => onAttach(rule.id)}
              >
                <RowIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left font-mono">
                  {rule.name}
                </span>
                <Plus className="size-3 shrink-0 opacity-60" />
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
