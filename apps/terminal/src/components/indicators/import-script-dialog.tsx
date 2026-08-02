// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ClipboardPaste, FileUp, GitFork, SquareFunction } from 'lucide-react'

import { looksLikeZip } from '@pairlens/shared/plugin-package'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'
import { Textarea } from '@pairlens/ui/components/ui/textarea'

import type { ImportedScript } from '@/lib/indicators/import-script'
import { track } from '@/lib/analytics-events'
import {
  DEFAULT_IMPORT_NAME,
  IndicatorImportError,
  dedupeScriptName,
  forkFromDescriptor,
  importFromPython,
  importFromZip,
  looksLikeIndicatorSource,
} from '@/lib/indicators/import-script'
import { customIndicatorRegistry } from '@/lib/indicators/custom-indicator-registry'
import { USER_INDICATORS_PLUGIN_ID } from '@/lib/indicators/user-indicators-plugin'
import { usePluginManager } from '@/lib/pairlens-provider'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

// ---------------------------------------------------------------------------
// "Import indicator" — the way scripts come in. Three routes, cheapest first:
// paste what a friend sent you, open a .py/.zip you downloaded, or fork an
// indicator that arrived with a plugin you already trust. Every route ends in
// the same place: validated {name, source, modules} → createScript().
// ---------------------------------------------------------------------------

type ImportSource = 'paste' | 'file' | 'fork'

const subscribeToCustomIndicators = (onChange: () => void) =>
  customIndicatorRegistry.subscribe(onChange)

const getCustomIndicatorsVersion = () => customIndicatorRegistry.getVersion()

type ImportScriptDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new script's id once it is in the store. */
  onImported: (scriptId: string) => void
}

export function ImportScriptDialog({
  open,
  onOpenChange,
  onImported,
}: ImportScriptDialogProps) {
  const { t } = useTranslation()
  const pluginManager = usePluginManager()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const createScript = useIndicatorScriptsStore((s) => s.createScript)
  const loadScripts = useIndicatorScriptsStore((s) => s.load)

  const [tab, setTab] = useState<ImportSource>('paste')
  const [pasted, setPasted] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fresh sheet on every open — a stale error or half-typed name from last
  // time is confusing, and dedupe needs the store hydrated.
  useEffect(() => {
    if (!open) return
    loadScripts()
    setTab('paste')
    setPasted('')
    setName('')
    setError(null)
  }, [open, loadScripts])

  // Rebuilt only when a plugin activates or deactivates.
  const registryVersion = useSyncExternalStore(
    subscribeToCustomIndicators,
    getCustomIndicatorsVersion,
    getCustomIndicatorsVersion,
  )
  const forkable = useMemo(
    () =>
      customIndicatorRegistry
        .getAll()
        .filter((entry) => entry.providerId !== USER_INDICATORS_PLUGIN_ID)
        .map((entry) => ({
          ...entry,
          providerName:
            pluginManager
              .getInstalledPlugins()
              .find((p) => p.manifest.id === entry.providerId)?.manifest.name ??
            entry.providerId,
        })),
    [registryVersion, pluginManager],
  )

  const commit = (imported: ImportedScript, source: ImportSource) => {
    const unique = dedupeScriptName(
      imported.name,
      scripts.map((s) => s.name),
    )
    const id = createScript(unique, imported.source, imported.modules)
    track('python_indicator_imported', { source })
    toast.success(t('indicatorsPage.importSuccess', { name: unique }))
    onImported(id)
    onOpenChange(false)
  }

  const run = (source: ImportSource, importer: () => ImportedScript) => {
    setError(null)
    try {
      commit(importer(), source)
    } catch (err) {
      setError(err)
    }
  }

  const handlePaste = () =>
    run('paste', () =>
      importFromPython(name.trim() || DEFAULT_IMPORT_NAME, pasted),
    )

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // Trust the bytes over the extension — a renamed .zip is still a zip.
      const imported = looksLikeZip(bytes)
        ? await importFromZip(file.name, bytes)
        : importFromPython(file.name, new TextDecoder('utf-8').decode(bytes))
      commit(imported, 'file')
    } catch (err) {
      setError(err)
    }
  }

  const message =
    error instanceof IndicatorImportError
      ? t(`indicatorsPage.importError.${error.code}`, error.params)
      : error
        ? t('indicatorsPage.importError.unknown')
        : null

  const pasteLooksWrong =
    pasted.trim().length > 0 && !looksLikeIndicatorSource(pasted)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('indicatorsPage.importTitle')}</DialogTitle>
          <DialogDescription>
            {t('indicatorsPage.importDescription')}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".py,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as ImportSource)
            setError(null)
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="paste" className="flex-1 text-xs">
              <ClipboardPaste className="size-3.5" />
              {t('indicatorsPage.importTabPaste')}
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1 text-xs">
              <FileUp className="size-3.5" />
              {t('indicatorsPage.importTabFile')}
            </TabsTrigger>
            <TabsTrigger value="fork" className="flex-1 text-xs">
              <GitFork className="size-3.5" />
              {t('indicatorsPage.importTabFork')}
            </TabsTrigger>
          </TabsList>

          {/* 1 — Paste. The path people actually use. */}
          <TabsContent value="paste" className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="import-script-name">
                {t('indicatorsPage.importNameLabel')}
              </Label>
              <Input
                id="import-script-name"
                className="h-8 text-sm"
                placeholder={t('indicatorsPage.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-script-source">
                {t('indicatorsPage.importPasteLabel')}
              </Label>
              <Textarea
                id="import-script-source"
                className="max-h-64 min-h-40 font-mono text-xs"
                placeholder={t('indicatorsPage.importPastePlaceholder')}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              {pasteLooksWrong && (
                <p className="text-[11px] text-muted-foreground">
                  {t('indicatorsPage.importNotIndicator')}
                </p>
              )}
            </div>
          </TabsContent>

          {/* 2 — A file from disk. */}
          <TabsContent value="file" className="pt-1">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <FileUp className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-[11px] text-muted-foreground">
                {t('indicatorsPage.importFileHint')}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('indicatorsPage.importChooseFile')}
              </Button>
            </div>
          </TabsContent>

          {/* 3 — Fork an indicator that came with an installed plugin. */}
          <TabsContent value="fork" className="pt-1">
            {forkable.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SquareFunction />
                  </EmptyMedia>
                  <EmptyTitle>{t('indicatorsPage.importForkEmpty')}</EmptyTitle>
                  <EmptyDescription>
                    {t('indicatorsPage.importForkEmptyHint')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <p className="pb-2 text-[11px] text-muted-foreground">
                  {t('indicatorsPage.importForkHint')}
                </p>
                <ScrollArea className="h-56">
                  <ul className="space-y-1 pr-2.5">
                    {forkable.map((entry) => (
                      <li
                        key={entry.type}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <SquareFunction
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            {entry.descriptor.meta.title}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {entry.providerName}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 text-xs"
                          onClick={() =>
                            run('fork', () =>
                              forkFromDescriptor(entry.descriptor),
                            )
                          }
                        >
                          {t('indicatorsPage.importFork')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </>
            )}
          </TabsContent>
        </Tabs>

        {message && (
          <p role="alert" className="text-[11px] text-destructive">
            {message}
          </p>
        )}

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('indicatorsPage.cancel')}
          </Button>
          {tab === 'paste' && (
            <Button
              size="sm"
              onClick={handlePaste}
              disabled={pasted.trim().length === 0}
            >
              {t('indicatorsPage.importAction')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
