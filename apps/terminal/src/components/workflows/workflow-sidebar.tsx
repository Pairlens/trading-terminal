// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChevronDown, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { WorkflowRunRecord } from '@/stores/workflow-run-store'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useWorkflowRunStore } from '@/stores/workflow-run-store'

export function WorkflowSidebar() {
  const workflows = useWorkflowStore((s) => s.workflows)
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  const selectWorkflow = useWorkflowStore((s) => s.selectWorkflow)
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow)
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow)
  const renameWorkflow = useWorkflowStore((s) => s.renameWorkflow)
  const startEditing = useWorkflowStore((s) => s.startEditing)

  const [tab, setTab] = useState<'workflows' | 'runs'>('workflows')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  // Pre-fill rename dialog with current name
  useEffect(() => {
    if (renameId) {
      const wf = workflows.find((w) => w.id === renameId)
      setRenameName(wf?.name ?? '')
    }
  }, [renameId, workflows])

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = createWorkflow(newName.trim())
    selectWorkflow(id)
    startEditing(id)
    setNewName('')
    setCreateOpen(false)
  }

  const handleDelete = () => {
    if (!deleteId) return
    deleteWorkflow(deleteId)
    setDeleteId(null)
  }

  const handleRename = () => {
    if (!renameId || !renameName.trim()) return
    renameWorkflow(renameId, renameName.trim())
    setRenameId(null)
  }

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider">
          <button
            type="button"
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              tab === 'workflows'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('workflows')}
          >
            Workflows
          </button>
          <button
            type="button"
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors',
              tab === 'runs'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('runs')}
          >
            Runs
          </button>
        </div>
        {tab === 'workflows' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      {tab === 'runs' ? (
        <RunHistoryList />
      ) : (
        <div className="flex-1 overflow-y-auto p-1.5">
          {workflows.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No workflows yet
            </p>
          )}
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                activeWorkflowId === wf.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => {
                selectWorkflow(wf.id)
                startEditing(wf.id)
              }}
            >
              <Workflow className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{wf.name}</span>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenameId(wf.id)
                  }}
                >
                  <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteId(wf.id)
                  }}
                >
                  <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Workflow name"
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
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameId} onOpenChange={() => setRenameId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Workflow</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Workflow name"
            className="h-8 text-sm"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!renameName.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The workflow will be permanently
            deleted.
          </p>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Run History ──────────────────────────────────────────────────────
// The live execution toast disappears after 6s; this list is the durable
// answer to "what did my workflow actually do?". Rows expand to show
// per-step outcomes.

const runStatusStyle: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  partial: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  cancelled: 'text-muted-foreground',
}

function RunHistoryList() {
  const runs = useWorkflowRunStore((s) => s.runs)
  const clear = useWorkflowRunStore((s) => s.clear)
  const load = useWorkflowRunStore((s) => s.load)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-1.5">
        {runs.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No workflow runs yet — execute one from the trade panel
          </p>
        )}
        {runs.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            expanded={expandedId === run.id}
            onToggle={() =>
              setExpandedId(expandedId === run.id ? null : run.id)
            }
          />
        ))}
      </div>
      {runs.length > 0 && (
        <div className="border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full text-[10px] text-muted-foreground"
            onClick={clear}
          >
            Clear history
          </Button>
        </div>
      )}
    </div>
  )
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: WorkflowRunRecord
  expanded: boolean
  onToggle: () => void
}) {
  const executed = run.result.results.filter(
    (r) => r.status === 'executed',
  ).length
  const failed = run.result.results.filter((r) => r.status === 'failed').length

  return (
    <div className="rounded-md hover:bg-muted">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            !expanded && '-rotate-90',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {run.result.workflowName}
            </span>
            <span
              className={cn(
                'shrink-0 text-[9px] font-medium uppercase',
                runStatusStyle[run.result.status] ?? 'text-muted-foreground',
              )}
            >
              {run.result.status}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="font-mono">{run.pair}</span>
            <span>·</span>
            <span>{run.mode}</span>
            <span>·</span>
            <span>
              {new Date(run.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>·</span>
            <span>
              {executed} ok{failed > 0 ? `, ${failed} failed` : ''}
            </span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="space-y-0.5 px-2 pb-1.5 pl-6">
          {run.result.results.map((step) => (
            <div key={step.stepId} className="text-[10px]">
              <span
                className={cn(
                  step.status === 'executed'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : step.status === 'failed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground',
                )}
              >
                {step.status === 'executed'
                  ? '✓'
                  : step.status === 'failed'
                    ? '✗'
                    : '–'}
              </span>{' '}
              <span className="text-foreground">{step.stepLabel}</span>
              {step.error && (
                <span className="text-muted-foreground"> — {step.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
