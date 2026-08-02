// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FolderDown } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'

import {
  buildIndicatorPluginPackage,
  isValidPluginId,
  slugifyPluginId,
} from './export-plugin'

import type { IndicatorScript } from '@/stores/indicator-scripts-store'
import { track } from '@/lib/analytics-events'
import {
  canRevealSavedFiles,
  revealSavedFile,
  saveToDownloads,
  savedFileFolder,
} from '@/lib/save-file'

type ExportPluginDialogProps = {
  script: IndicatorScript | null
  onClose: () => void
}

/**
 * "Export as plugin" — name + slug id, validated against the manifest schema
 * before the zip is offered for download.
 */
export function ExportPluginDialog({
  script,
  onClose,
}: ExportPluginDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [errors, setErrors] = useState<Array<string>>([])

  // Reset fields each time a script is picked for export.
  useEffect(() => {
    if (script) {
      setName(script.name)
      setId(slugifyPluginId(script.name))
      setIdTouched(false)
      setErrors([])
    }
  }, [script])

  const idInvalid = id.length > 0 && !isValidPluginId(id)

  const handleNameChange = (next: string) => {
    setName(next)
    if (!idTouched) setId(slugifyPluginId(next))
  }

  const handleExport = async () => {
    if (!script?.meta) return
    const result = buildIndicatorPluginPackage({
      id,
      name: name.trim() || script.name,
      meta: script.meta,
      source: script.source,
      modules: script.modules,
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }

    let saved
    try {
      saved = await saveToDownloads(
        result.bytes,
        result.fileName,
        'application/zip',
      )
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
      return
    }

    track('python_indicator_exported')
    const folder = savedFileFolder(saved.path)
    toast.success(
      t('indicatorsPage.exportSuccess', { file: result.fileName }),
      {
        description: folder
          ? t('indicatorsPage.exportSavedTo', { folder })
          : t('indicatorsPage.exportSavedToDownloads'),
        action:
          canRevealSavedFiles && saved.path
            ? {
                label: t('common.showInFolder'),
                onClick: () => void revealSavedFile(saved.path as string),
              }
            : undefined,
      },
    )
    onClose()
  }

  return (
    <Dialog open={!!script} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('indicatorsPage.exportTitle')}</DialogTitle>
          <DialogDescription>
            {t('indicatorsPage.exportDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="export-plugin-name">
              {t('indicatorsPage.exportName')}
            </Label>
            <Input
              id="export-plugin-name"
              className="h-8 text-sm"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-plugin-id">
              {t('indicatorsPage.exportId')}
            </Label>
            <Input
              id="export-plugin-id"
              className="h-8 font-mono text-sm"
              value={id}
              aria-invalid={idInvalid}
              onChange={(e) => {
                setIdTouched(true)
                setId(e.target.value)
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('indicatorsPage.exportIdHint')}
            </p>
          </div>
          {errors.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          {/* Say where the file lands before the click, not only after. */}
          <p className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            <FolderDown className="size-3.5 shrink-0" aria-hidden />
            {t('indicatorsPage.exportLocationHint')}
          </p>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('indicatorsPage.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleExport()}
            disabled={!script?.meta || !isValidPluginId(id) || !name.trim()}
          >
            {t('indicatorsPage.exportDownload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
