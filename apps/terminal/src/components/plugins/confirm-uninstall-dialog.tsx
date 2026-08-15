// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one uninstall confirmation, shared by the Plugin Store and the Installed
 * tab. Both had their own copy of the same dialog with the same keys, and the
 * two buttons had already drifted to different words.
 *
 * It holds the manifest, not an id: the Store's product page can change under
 * an open dialog, and confirming has to remove the plugin the user was looking
 * at when they opened it.
 */

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

import type { PluginManifest } from '@pairlens/plugin-system'

export type ConfirmUninstallDialogProps = {
  /** The plugin awaiting confirmation, captured when the dialog opened. */
  manifest: PluginManifest | null
  onOpenChange: (open: boolean) => void
  onConfirm: (manifest: PluginManifest) => void
}

export function ConfirmUninstallDialog({
  manifest,
  onOpenChange,
  onConfirm,
}: ConfirmUninstallDialogProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={!!manifest} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('pluginStore.uninstallPluginTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('pluginStore.uninstallPluginDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (manifest) onConfirm(manifest)
            }}
          >
            {t('pluginStore.uninstall')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
