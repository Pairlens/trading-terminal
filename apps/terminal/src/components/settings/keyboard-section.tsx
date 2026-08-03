// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import * as React from 'react'
import { AlertTriangle, Check, Plus, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { KeybindingCommand, KeymapId } from '@/lib/keybindings'
import { useKeybindingsVersion } from '@/hooks/use-keybindings'
import {
  KEYBINDING_CATEGORIES,
  KEYMAPS,
  availableCommands,
  chordFromEvent,
  chordLabel,
  commandsUsingChord,
  formatChord,
  getCommandChords,
  getKeybindingsState,
  isCommandCustomized,
  isRiskyChord,
  labelForSerializedChord,
  listConflicts,
  parseChord,
  removeCommandChord,
  resetAllCommands,
  resetCommand,
  setCommandChords,
  setKeymap,
} from '@/lib/keybindings'
import { track } from '@/lib/analytics-events'

/**
 * The keyboard settings surface: pick a preset, rebind anything, see what
 * collides.
 *
 * Recording is deliberately literal — the very next chord you press is what
 * gets assigned, Escape and Enter included, because a terminal power user who
 * wants Escape on a command should be able to have it. That means the recorder
 * has to take the keyboard away from everything else while it's armed (capture
 * phase + stopPropagation), and that leaving it is a mouse action.
 */

export function KeyboardSection() {
  const { t } = useTranslation()
  // Every read below goes through the store; this is what re-renders the
  // section when a binding changes (including from another window).
  useKeybindingsVersion()

  const [query, setQuery] = React.useState('')
  const [recordingId, setRecordingId] = React.useState<string | null>(null)
  const [resetAllOpen, setResetAllOpen] = React.useState(false)

  const state = getKeybindingsState()
  const commands = availableCommands()
  const conflicts = listConflicts()

  const normalizedQuery = query.trim().toLowerCase()
  const matches = React.useCallback(
    (command: KeybindingCommand) => {
      if (!normalizedQuery) return true
      const haystack = [
        t(command.labelKey),
        command.id,
        ...getCommandChords(command.id).map(labelForSerializedChord),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    },
    [normalizedQuery, t],
  )

  const groups = KEYBINDING_CATEGORIES.map((category) => ({
    category,
    commands: commands.filter(
      (command) => command.categoryId === category.id && matches(command),
    ),
  })).filter((group) => group.commands.length > 0)

  const handleKeymapChange = (keymap: KeymapId) => {
    setKeymap(keymap)
    track('settings_section_viewed', { section: `keyboard:${keymap}` })
  }

  const handleRecorded = (commandId: string, serialized: string) => {
    setCommandChords(commandId, [
      ...getCommandChords(commandId).filter((c) => c !== serialized),
      serialized,
    ])
    setRecordingId(null)
  }

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.keyboard.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.keyboard.description')}
        </p>

        <h4 className="mt-5 text-sm font-medium">
          {t('settings.keyboard.presetTitle')}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.keyboard.presetDescription')}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {KEYMAPS.map((keymap) => (
            <button
              key={keymap.id}
              type="button"
              onClick={() => handleKeymapChange(keymap.id)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                state.keymap === keymap.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {t(keymap.labelKey)}
                {state.keymap === keymap.id && (
                  <Check className="size-3.5 text-primary" />
                )}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(keymap.descriptionKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {conflicts.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            {t('settings.keyboard.conflictsTitle')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.keyboard.conflictsDescription')}
          </p>
          <ul className="mt-3 space-y-1.5">
            {conflicts.map(({ chord, commandIds }) => (
              <li key={chord} className="flex items-center gap-2 text-xs">
                <Kbd>{labelForSerializedChord(chord)}</Kbd>
                <span className="text-muted-foreground">
                  {commandIds.map((id) => commandLabel(id, t)).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('settings.keyboard.searchPlaceholder')}
          className="h-8 max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setResetAllOpen(true)}
        >
          <RotateCcw className="size-3.5" />
          {t('settings.keyboard.resetAll')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('settings.keyboard.noResults')}
        </p>
      ) : (
        groups.map(({ category, commands: rows }) => (
          <section key={category.id} className="rounded-xl border">
            <h4 className="border-b px-4 py-2.5 text-sm font-medium">
              {t(category.labelKey)}
            </h4>
            <ul className="divide-y">
              {rows.map((command) => (
                <CommandRow
                  key={command.id}
                  command={command}
                  isRecording={recordingId === command.id}
                  onStartRecording={() => setRecordingId(command.id)}
                  onStopRecording={() => setRecordingId(null)}
                  onRecorded={(serialized) =>
                    handleRecorded(command.id, serialized)
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <AlertDialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.keyboard.resetAllTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.keyboard.resetAllDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetAllCommands()
                setResetAllOpen(false)
              }}
            >
              {t('settings.keyboard.resetAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Command display name, falling back to the raw id for anything untranslated. */
function commandLabel(commandId: string, t: (key: string) => string): string {
  const command = availableCommands().find((c) => c.id === commandId)
  return command ? t(command.labelKey) : commandId
}

function CommandRow({
  command,
  isRecording,
  onStartRecording,
  onStopRecording,
  onRecorded,
}: {
  command: KeybindingCommand
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onRecorded: (serialized: string) => void
}) {
  const { t } = useTranslation()
  const chords = getCommandChords(command.id)
  const customized = isCommandCustomized(command.id)

  const conflictLabels = chords
    .flatMap((chord) => commandsUsingChord(chord, command.id))
    .map((id) => commandLabel(id, t))
  const risky = chords.some((chord) => {
    const parsed = parseChord(chord)
    return parsed ? isRiskyChord(parsed) : false
  })

  return (
    // Row actions stay out of the way until you reach for them — this list is
    // 40+ rows long and three permanent icon buttons per row reads as noise.
    // `focus-within` keeps them reachable by keyboard alone.
    <li className="group/row flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{t(command.labelKey)}</span>
          {customized && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {t('settings.keyboard.customized')}
            </Badge>
          )}
          {command.scope === 'chart' && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {t('settings.keyboard.chartScope')}
            </span>
          )}
        </div>
        {conflictLabels.length > 0 && (
          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
            {t('settings.keyboard.conflictWith', {
              commands: [...new Set(conflictLabels)].join(', '),
            })}
          </p>
        )}
        {risky && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('settings.keyboard.risky')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isRecording ? (
          <ChordRecorder
            onRecorded={onRecorded}
            onCancel={onStopRecording}
            cancelLabel={t('settings.keyboard.stopRecording')}
            prompt={t('settings.keyboard.recording')}
          />
        ) : (
          <>
            {chords.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('settings.keyboard.unbound')}
              </span>
            ) : (
              chords.map((chord) => (
                <span
                  key={chord}
                  className="flex items-center gap-0.5 rounded-md border bg-muted/40 py-0.5 pl-1.5 pr-0.5"
                >
                  <Kbd className="border-none bg-transparent px-0">
                    {labelForSerializedChord(chord)}
                  </Kbd>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                          aria-label={t('settings.keyboard.removeBinding')}
                          onClick={() => removeCommandChord(command.id, chord)}
                        />
                      }
                    >
                      <X className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('settings.keyboard.removeBinding')}
                    </TooltipContent>
                  </Tooltip>
                </span>
              ))
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    aria-label={t('settings.keyboard.addBinding')}
                    onClick={onStartRecording}
                  />
                }
              >
                <Plus className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                {t('settings.keyboard.addBinding')}
              </TooltipContent>
            </Tooltip>
            {/* Only rendered once there is something to restore, and then it
                stays visible — an edited row should always show its way back. */}
            {customized && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t('settings.keyboard.restoreDefault')}
                      onClick={() => resetCommand(command.id)}
                    />
                  }
                >
                  <RotateCcw className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  {t('settings.keyboard.restoreDefault')}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/**
 * Swallows the keyboard while armed and reports the first real chord.
 *
 * The listener sits in the capture phase on `window` and stops propagation, so
 * nothing downstream — the app's own shortcuts, the chart pane router, or the
 * dialog's own Escape-to-close — sees the keystroke. That is what lets Escape,
 * Enter and Delete be recordable like any other key.
 */
function ChordRecorder({
  onRecorded,
  onCancel,
  cancelLabel,
  prompt,
}: {
  onRecorded: (serialized: string) => void
  onCancel: () => void
  cancelLabel: string
  prompt: string
}) {
  const [preview, setPreview] = React.useState<string>('')
  const onRecordedRef = React.useRef(onRecorded)
  onRecordedRef.current = onRecorded

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      // Immediate, not just `stopPropagation`: listeners registered on `window`
      // itself are same-node listeners, and plain stopPropagation would still
      // let them run for an event whose target is the window.
      e.stopImmediatePropagation()
      const chord = chordFromEvent(e)
      // Bare modifier presses just update the preview: holding ⌘ then hitting P
      // should read as ⌘P, not as two separate attempts.
      if (!chord) {
        setPreview(
          `${e.ctrlKey ? '⌃' : ''}${e.altKey ? '⌥' : ''}${
            e.shiftKey ? '⇧' : ''
          }${e.metaKey ? '⌘' : ''}`,
        )
        return
      }
      setPreview(chordLabel(chord))
      onRecordedRef.current(formatChord(chord))
    }
    // `keyup` is swallowed too, so a released modifier can't leak out as a
    // stray shortcut somewhere else.
    const swallow = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', handler, true)
    window.addEventListener('keyup', swallow, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      window.removeEventListener('keyup', swallow, true)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 min-w-24 items-center justify-center rounded-md border border-primary bg-primary/5 px-2 text-xs">
        {preview || prompt}
      </span>
      <Button size="xs" variant="ghost" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  )
}
