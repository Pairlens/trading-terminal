// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import {
  Bell,
  Copy,
  FlaskConical,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Switch } from '@pairlens/ui/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { isSimpleAlert } from '@pairlens/notification-engine/simple-alerts'

import {
  MASTER_DETAIL_LIST_CLASS,
  MASTER_DETAIL_LIST_HEADER_CLASS,
} from '../master-detail'
import { NewAlertDialog } from './new-alert-dialog'
import { useSimpleAlertView } from './use-simple-alert-view'
import type { NotificationLogEntry } from '@/lib/notifications/notification-runtime'
import { sendTestNotification } from '@/lib/notifications/test-fire'
import { useNotificationStore } from '@/stores/notification-store'
import { useNotificationLogStore } from '@/stores/notification-log-store'

export function NotificationsSidebar() {
  const { t } = useTranslation()
  const rules = useNotificationStore((s) => s.rules)
  const activeRuleId = useNotificationStore((s) => s.activeRuleId)
  const selectRule = useNotificationStore((s) => s.selectRule)
  const createRule = useNotificationStore((s) => s.createRule)
  const deleteRule = useNotificationStore((s) => s.deleteRule)
  const renameRule = useNotificationStore((s) => s.renameRule)
  const toggleRule = useNotificationStore((s) => s.toggleRule)
  const duplicateRule = useNotificationStore((s) => s.duplicateRule)
  const startEditing = useNotificationStore((s) => s.startEditing)

  const [tab, setTab] = useState<'rules' | 'activity'>('rules')
  const [alertOpen, setAlertOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const simpleSelected = useSimpleAlertView(activeRuleId)

  // Pre-fill rename dialog with current name
  useEffect(() => {
    if (renameId) {
      const rule = rules.find((r) => r.id === renameId)
      setRenameName(rule?.name ?? '')
    }
  }, [renameId, rules])

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = createRule(newName.trim())
    selectRule(id)
    startEditing(id)
    setNewName('')
    setCreateOpen(false)
  }

  const handleDelete = () => {
    if (!deleteId) return
    deleteRule(deleteId)
    setDeleteId(null)
  }

  const handleRename = () => {
    if (!renameId || !renameName.trim()) return
    renameRule(renameId, renameName.trim())
    setRenameId(null)
  }

  return (
    <div className={MASTER_DETAIL_LIST_CLASS}>
      {/* Header with tabs */}
      <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider">
          <button
            type="button"
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              tab === 'rules'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('rules')}
          >
            {t('notifications.builder.sidebar.tabRules')}
          </button>
          <button
            type="button"
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              tab === 'activity'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('activity')}
          >
            {t('notifications.builder.sidebar.tabActivity')}
          </button>
        </div>
        {tab === 'rules' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('notifications.simple.newTitle')}
            onClick={() => setAlertOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      {tab === 'activity' ? (
        <ActivityList />
      ) : (
        <>
          {/* List */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {rules.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('notifications.builder.sidebar.noRules')}
              </p>
            )}
            {rules.map((rule) => {
              const disabled = rule.enabled === false
              // A bell for the alerts, the flow mark for everything else —
              // the list says which editor a row opens before it is clicked.
              const RowIcon = isSimpleAlert(rule) ? Bell : Workflow
              return (
                <div
                  key={rule.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                    activeRuleId === rule.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    disabled && 'opacity-60',
                  )}
                  onClick={() => {
                    selectRule(rule.id)
                    startEditing(rule.id)
                  }}
                >
                  <RowIcon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{rule.name}</span>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameId(rule.id)
                      }}
                    >
                      <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateRule(rule.id)
                      }}
                    >
                      <Copy className="size-3 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(rule.id)
                      }}
                    >
                      <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <Switch
                    className="scale-75"
                    checked={!disabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )
            })}
          </div>

          {/* The way to something the two-field form cannot say. Bottom of
              the list, quiet: most people never need it, and the ones who do
              are looking for it. */}
          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 text-[11px] text-muted-foreground"
              onClick={() => setCreateOpen(true)}
            >
              <Workflow className="size-3.5" />
              {t('notifications.simple.newFlow')}
            </Button>
          </div>

          {/* Bindings for the selected rule. Simple alerts manage their own
              pairs in the form, so this would be a second editable copy. */}
          {activeRuleId && !simpleSelected && (
            <BindingsPanel ruleId={activeRuleId} />
          )}
        </>
      )}

      <NewAlertDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        onCreated={(id) => {
          selectRule(id)
          startEditing(id)
        }}
      />

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setNewName('')
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {t('notifications.builder.sidebar.newRuleTitle')}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t('notifications.builder.sidebar.rulePlaceholder')}
            className="h-8 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameId} onOpenChange={() => setRenameId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {t('notifications.builder.sidebar.renameRuleTitle')}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t('notifications.builder.sidebar.rulePlaceholder')}
            className="h-8 text-sm"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              {t('notifications.builder.sidebar.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {t('notifications.builder.sidebar.deleteRuleTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('notifications.builder.sidebar.deleteRuleWarning')}
          </p>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Bindings Panel ───────────────────────────────────────────────────
// A rule is pair-agnostic; bindings attach it to concrete pair+market
// scopes. This panel manages the selected rule's bindings and offers a
// test-fire that exercises real channel deliveries.

function BindingsPanel({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation()
  const rule = useNotificationStore((s) => s.rules.find((r) => r.id === ruleId))
  const bindings = useNotificationStore((s) => s.bindings)
  const addBinding = useNotificationStore((s) => s.addBinding)
  const removeBinding = useNotificationStore((s) => s.removeBinding)
  const toggleBinding = useNotificationStore((s) => s.toggleBinding)

  const [pair, setPair] = useState('')
  const [market, setMarket] = useState('')
  const [testing, setTesting] = useState(false)

  if (!rule) return null
  const ruleBindings = bindings.filter((b) => b.ruleId === ruleId)

  const handleAdd = () => {
    const p = pair.trim().toUpperCase()
    const m = market.trim().toLowerCase()
    if (!p || !m) return
    if (ruleBindings.some((b) => b.pair === p && b.market === m)) {
      toast.info(t('notifications.builder.sidebar.pairAlreadyBound'))
      return
    }
    addBinding(ruleId, p, m)
    setPair('')
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const scope = ruleBindings[0]
      const outcome = await sendTestNotification(
        rule,
        scope?.pair ?? 'BTC-USDT',
        scope?.market ?? 'okx',
      )
      if (outcome.ok) {
        toast.success(t('notifications.builder.sidebar.testSent'), {
          description: outcome.detail,
        })
      } else {
        toast.error(t('notifications.builder.sidebar.testFailed'), {
          description: outcome.detail,
        })
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('notifications.builder.sidebar.pairsLabel')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[10px]"
          disabled={testing}
          onClick={handleTest}
        >
          <FlaskConical className="size-3" />
          {testing
            ? t('notifications.builder.sidebar.testing')
            : t('notifications.builder.sidebar.sendTest')}
        </Button>
      </div>

      <div className="max-h-40 overflow-y-auto px-1.5 pb-1">
        {ruleBindings.length === 0 && (
          <p className="px-2 pb-1 text-[11px] text-muted-foreground">
            {t('notifications.builder.sidebar.noBindings')}
          </p>
        )}
        {ruleBindings.map((b) => (
          <div
            key={b.id}
            className="group flex items-center gap-2 rounded px-2 py-1 text-xs"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono',
                !b.enabled && 'text-muted-foreground line-through',
              )}
            >
              {b.pair}
              <span className="ml-1 text-muted-foreground">{b.market}</span>
            </span>
            <Switch
              className="scale-[0.65]"
              checked={b.enabled}
              onCheckedChange={() => toggleBinding(b.id)}
            />
            <button
              type="button"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => removeBinding(b.id)}
            >
              <X className="size-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 px-3 pb-2.5">
        <Input
          placeholder="BTC-USDT"
          className="h-6 flex-1 font-mono text-[10px]"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Input
          placeholder="okx"
          className="h-6 w-16 font-mono text-[10px]"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={!pair.trim() || !market.trim()}
          onClick={handleAdd}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ── Activity List ────────────────────────────────────────────────────
// Recent notification deliveries (leader window appends, all windows
// mirror). Failed channel deliveries are called out inline.

const severityDot: Record<NotificationLogEntry['severity'], string> = {
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

function ActivityList() {
  const { t } = useTranslation()
  const entries = useNotificationLogStore((s) => s.entries)
  const clear = useNotificationLogStore((s) => s.clear)
  const load = useNotificationLogStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-1.5">
        {entries.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('notifications.builder.sidebar.noActivity')}
          </p>
        )}
        {entries.map((entry) => {
          const failures = entry.deliveries?.filter((d) => !d.ok) ?? []
          return (
            <div
              key={entry.id}
              className="rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    severityDot[entry.severity],
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {entry.title}
                </span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-0.5 truncate pl-3 text-[11px] text-muted-foreground">
                {entry.body}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-3">
                <span className="text-[9px] text-muted-foreground">
                  {entry.ruleName} · {entry.channels.join(', ')}
                </span>
                {failures.map((f) => (
                  <span
                    key={f.channel}
                    className="rounded bg-red-500/10 px-1 text-[9px] text-red-600 dark:text-red-400"
                    title={f.error}
                  >
                    {t('notifications.builder.sidebar.channelFailed', {
                      channel: f.channel,
                    })}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {entries.length > 0 && (
        <div className="border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full text-[10px] text-muted-foreground"
            onClick={clear}
          >
            {t('notifications.builder.sidebar.clearActivity')}
          </Button>
        </div>
      )}
    </div>
  )
}
