// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, LogIn, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
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
  NativeSelect,
  NativeSelectOption,
} from '@pairlens/ui/components/ui/native-select'
import { Textarea } from '@pairlens/ui/components/ui/textarea'

import { WorkspaceLayoutPreview } from './workspace-layout-preview'
import type {
  AssetClass,
  ScreenSize,
  TraderType,
} from '@/lib/workspace-store/types'
import type {
  CustomWorkspaceDefinition,
  TerminalLayout,
} from '@/lib/layout/types'
import { SignInDialog } from '@/components/sign-in-dialog'
import { WORKSPACE_ICONS } from '@/components/workspace/workspace-icons'
import { queryKeys } from '@/lib/api'
import { useWorkspaceStoreRegistry } from '@/lib/workspace-store/use-workspace-templates'
import { useOptimisticSession } from '@/lib/session'
import {
  ASSET_CLASSES,
  SCREEN_SIZES,
  TRADER_TYPES,
} from '@/lib/workspace-store/catalog'
import {
  assetClassLabel,
  screenSizeLabel,
  traderTypeLabel,
} from '@/lib/workspace-store/template-labels'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselected workspace. When omitted, the dialog shows a workspace picker. */
  workspace?: CustomWorkspaceDefinition | null
}

/** Guess a screen-size facet from a layout's column count. */
function deriveScreenSize(layout: TerminalLayout): ScreenSize {
  const cols = layout.columns.length
  if (cols <= 1) return 'compact'
  if (cols === 2) return 'standard'
  if (cols === 3) return 'wide'
  return 'multi'
}

function TogglePills<T extends string>({
  values,
  labelOf,
  selected,
  onToggle,
}: {
  values: ReadonlyArray<T>
  labelOf: (v: T) => string
  selected: Array<T>
  onToggle: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const active = selected.includes(v)
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted',
            )}
          >
            {labelOf(v)}
          </button>
        )
      })}
    </div>
  )
}

export function ShareWorkspaceDialog({ open, onOpenChange, workspace }: Props) {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const queryClient = useQueryClient()
  const registry = useWorkspaceStoreRegistry()

  const workspaces = useCustomWorkspacesStore((s) => s.workspaces)
  const loadWorkspaces = useCustomWorkspacesStore((s) => s.load)
  useEffect(() => {
    if (open) loadWorkspaces()
  }, [open, loadWorkspaces])

  const [pickedId, setPickedId] = useState<string | null>(workspace?.id ?? null)
  const activeWs = useMemo(
    () => workspace ?? workspaces.find((w) => w.id === pickedId) ?? null,
    [workspace, workspaces, pickedId],
  )

  // Which store to publish to. Only surfaced when more than one store accepts
  // submissions; otherwise it defaults to the single available one.
  const submitProviders = registry.submitProviders
  const [targetProviderId, setTargetProviderId] = useState<string | null>(null)
  const targetProvider = useMemo(
    () =>
      submitProviders.find((p) => p.id === targetProviderId) ??
      submitProviders[0] ??
      null,
    [submitProviders, targetProviderId],
  )

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('Layers')
  const [traderTypes, setTraderTypes] = useState<Array<TraderType>>([])
  const [assetClasses, setAssetClasses] = useState<Array<AssetClass>>([])
  const [screenSizes, setScreenSizes] = useState<Array<ScreenSize>>([])
  const [tagsInput, setTagsInput] = useState('')

  // Seed the form from the chosen workspace when it changes or the dialog opens.
  const activeWsId = activeWs?.id
  useEffect(() => {
    if (!open || !activeWs) return
    setName(activeWs.name)
    setTagline('')
    setDescription(activeWs.description ?? '')
    setIcon(activeWs.icon ?? 'Layers')
    setTraderTypes([])
    setAssetClasses([])
    setScreenSizes([deriveScreenSize(activeWs.defaultLayout)])
    setTagsInput('')
    // Only re-seed on identity change (activeWsId), not on every keystroke.
  }, [open, activeWsId, activeWs])

  const toggle = <T extends string>(
    setter: React.Dispatch<React.SetStateAction<Array<T>>>,
    v: T,
  ) => {
    setter((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    )
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!activeWs) {
        throw new Error(
          t(
            'workspaceStore.share.pickWorkspace',
            'Choose a workspace to share',
          ),
        )
      }
      const trimmed = name.trim()
      if (!trimmed) {
        throw new Error(
          t('workspaceStore.share.nameRequired', 'Give it a name'),
        )
      }
      const tags = tagsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
      // Never share the account a wallet variable was pointed at.
      const variables = activeWs.variables.map((v) =>
        v.type === 'wallet' ? { ...v, defaultValue: undefined } : v,
      )
      const provider = targetProvider
      if (!provider?.submit) {
        throw new Error(
          t(
            'workspaceStore.share.noProvider',
            'No store is available to publish to',
          ),
        )
      }
      return provider.submit({
        name: trimmed,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        icon,
        facets: { traderTypes, assetClasses, screenSizes },
        tags,
        variables,
        layout: activeWs.defaultLayout,
        requiredPlugins: [],
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceStore(),
      })
      toast.success(
        t('workspaceStore.share.success', {
          defaultValue: '“{{name}}” shared to the store.',
          name: name.trim(),
        }),
      )
      onOpenChange(false)
    },
    onError: (e) => {
      toast.error(
        t('workspaceStore.share.error', 'Could not share workspace'),
        {
          description: e.message,
        },
      )
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4 text-primary" />
            {t('workspaceStore.share.title', 'Share to the store')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'workspaceStore.share.subtitle',
              'Publish this workspace as a template others can browse and copy.',
            )}
          </DialogDescription>
        </DialogHeader>

        {!session ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LogIn className="size-5" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              {t(
                'workspaceStore.share.signInRequired',
                'Sign in to share workspaces with the community.',
              )}
            </p>
            <SignInDialog>
              <Button>{t('nav.signIn', 'Sign in')}</Button>
            </SignInDialog>
          </div>
        ) : (
          <>
            <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-2">
              {/* Workspace picker (only when not launched from a specific one) */}
              {!workspace ? (
                <div className="space-y-1.5">
                  <Label>
                    {t('workspaceStore.share.workspace', 'Workspace')}
                  </Label>
                  <NativeSelect
                    className="w-full"
                    value={pickedId ?? ''}
                    onChange={(e) => setPickedId(e.target.value || null)}
                  >
                    <NativeSelectOption value="" disabled>
                      {t(
                        'workspaceStore.share.pickWorkspace',
                        'Choose a workspace…',
                      )}
                    </NativeSelectOption>
                    {workspaces.map((w) => (
                      <NativeSelectOption key={w.id} value={w.id}>
                        {w.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {workspaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'workspaceStore.share.noWorkspaces',
                        'You don’t have any workspaces to share yet.',
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {activeWs ? (
                <WorkspaceLayoutPreview
                  layout={activeWs.defaultLayout}
                  className="h-28"
                />
              ) : null}

              {/* Store picker — only when more than one store accepts submissions */}
              {submitProviders.length > 1 ? (
                <div className="space-y-1.5">
                  <Label>
                    {t('workspaceStore.share.publishTo', 'Publish to')}
                  </Label>
                  <NativeSelect
                    className="w-full"
                    value={targetProvider?.id ?? ''}
                    onChange={(e) =>
                      setTargetProviderId(e.target.value || null)
                    }
                  >
                    {submitProviders.map((p) => (
                      <NativeSelectOption key={p.id} value={p.id}>
                        {p.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="share-name">
                  {t('workspaceStore.share.name', 'Name')}
                </Label>
                <Input
                  id="share-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(
                    'workspaceStore.share.namePlaceholder',
                    'Workspace name',
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="share-tagline">
                  {t('workspaceStore.share.tagline', 'Tagline')}
                </Label>
                <Input
                  id="share-tagline"
                  value={tagline}
                  maxLength={160}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder={t(
                    'workspaceStore.share.taglinePlaceholder',
                    'A one-line hook shown on the card',
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="share-description">
                  {t('workspaceStore.share.description', 'Description')}
                </Label>
                <Textarea
                  id="share-description"
                  value={description}
                  maxLength={4000}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'workspaceStore.share.descriptionPlaceholder',
                    'What is this layout for, and who is it for?',
                  )}
                  className="min-h-20"
                />
              </div>

              {/* Icon */}
              <div className="space-y-1.5">
                <Label>{t('workspaceStore.share.icon', 'Icon')}</Label>
                <div className="grid grid-cols-10 gap-1">
                  {Object.entries(WORKSPACE_ICONS).map(
                    ([iconName, IconComp]) => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setIcon(iconName)}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-md transition-colors',
                          icon === iconName
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted',
                        )}
                        aria-label={iconName}
                      >
                        <IconComp className="size-4" />
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Facets */}
              <div className="space-y-1.5">
                <Label>{t('workspaceStore.facet.trader', 'Trader')}</Label>
                <TogglePills
                  values={TRADER_TYPES}
                  labelOf={(v) => traderTypeLabel(t, v)}
                  selected={traderTypes}
                  onToggle={(v) => toggle(setTraderTypes, v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('workspaceStore.facet.asset', 'Asset')}</Label>
                <TogglePills
                  values={ASSET_CLASSES}
                  labelOf={(v) => assetClassLabel(t, v)}
                  selected={assetClasses}
                  onToggle={(v) => toggle(setAssetClasses, v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('workspaceStore.facet.screen', 'Screen')}</Label>
                <TogglePills
                  values={SCREEN_SIZES}
                  labelOf={(v) => screenSizeLabel(t, v)}
                  selected={screenSizes}
                  onToggle={(v) => toggle(setScreenSizes, v)}
                />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label htmlFor="share-tags">
                  {t('workspaceStore.share.tags', 'Tags')}
                </Label>
                <Input
                  id="share-tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder={t(
                    'workspaceStore.share.tagsPlaceholder',
                    'Comma-separated, e.g. scalping, orderbook',
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || !activeWs || !name.trim()}
              >
                {submit.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Share2 className="size-4" />
                )}
                {t('workspaceStore.share.submit', 'Share to store')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
