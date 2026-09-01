// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bring-your-own-key AI setup — the second door into every AI surface.
 *
 * Pairlens Intelligence is the recommended path, but it is a *plan*, not a
 * side effect of registering: its `ai:inference` and `ai:web-search`
 * declarations carry `requiresAuth` **and** `requiredAccessLevel:
 * 'intelligence'`, so a fresh account still lands on the upgrade card. A user
 * who already pays Anthropic, OpenAI, DeepSeek, OpenRouter or Groq has no reason to buy
 * a second subscription, and capability resolution has always agreed —
 * activating a BYOK plugin grants the capability outright. The gate was never
 * the engine, it was the UI: the only way to paste a key was the Plugins
 * page, which is a detour on desktop and unreachable on a phone (`/plugins`
 * is in DESKTOP_ONLY_PREFIXES). This puts the key fields where the gate is.
 *
 * Two steps, because the two capabilities are not equal:
 *   1. **Model** (`ai:inference`) — required. No model, no copilot.
 *   2. **Web search** (`ai:web-search`) — optional. It grounds research
 *      reports and the copilot's `web_search` tool in live sources; both
 *      degrade to market data alone without it (research-brain.ts), so the
 *      step is skippable and says so.
 *
 * Providers are discovered, not listed: `isByokProvider` reads the manifest,
 * so a third-party inference or search plugin installed from the store shows
 * up here with no change to this file.
 *
 * Activation mirrors the Plugins page exactly — activate, write the device
 * ledger, push the state to the App Server, bump the plugin version — because
 * a key pasted here has to survive a reload the same way one pasted there
 * does.
 */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  KeyRound,
} from 'lucide-react'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { cn } from '@pairlens/ui'
import type { PluginManifest } from '@pairlens/plugin-system'
import type { FormEvent } from 'react'

import type { ByokCapability } from '@/lib/plugins/byok-providers'
import { PluginBrandTile } from '@/components/plugins/plugin-icon'
import { ConfigFieldInput } from '@/components/config-field-input'
import { api, queryKeys } from '@/lib/api'
import { track } from '@/lib/analytics-events'
import { openExternalUrl } from '@/lib/platform'
import { usePairlens } from '@/lib/pairlens-provider'
import { useAiSetupStore } from '@/stores/ai-setup-store'
import { useLocalized } from '@/lib/plugin-text'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import { isByokProvider } from '@/lib/plugins/byok-providers'
import {
  getLedgerEntry,
  setLedgerConfig,
  setLedgerEnabled,
} from '@/lib/plugins/plugin-ledger'

/**
 * Where each bundled provider mints keys. A manifest only carries `homepage`
 * (the marketing site), and "go find the API keys page" is exactly the step
 * that loses people. Unknown providers fall back to their homepage.
 */
const KEY_CONSOLE_URLS: Record<string, string> = {
  'groq-inference': 'https://console.groq.com/keys',
  'openai-inference': 'https://platform.openai.com/api-keys',
  'deepseek-inference': 'https://platform.deepseek.com/api_keys',
  'anthropic-inference': 'https://console.anthropic.com/settings/keys',
  'openrouter-inference': 'https://openrouter.ai/keys',
  'tavily-search': 'https://app.tavily.com/home',
  'exa-search': 'https://dashboard.exa.ai/api-keys',
}

export type ByokProvider = {
  manifest: PluginManifest
  /** Active in the plugin manager — i.e. it has a working key already. */
  connected: boolean
}

/**
 * Installed providers for one AI capability that the user can turn on with a
 * key of their own. A declaration with `requiresAuth` is hosted (Pairlens
 * Intelligence) and is the thing this list is an alternative to, so it is
 * filtered out.
 */
export function useByokProviders(
  capability: ByokCapability,
): Array<ByokProvider> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      pluginManager
        .getInstalledPlugins()
        .filter((plugin) => isByokProvider(plugin.manifest, capability))
        .map((plugin) => ({
          manifest: plugin.manifest,
          connected: plugin.status === 'active',
        }))
        // Connected first: on a return visit the answer to "which one am I
        // using?" should be the first row, not a hunt down the list.
        .sort((a, b) => Number(b.connected) - Number(a.connected)),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion, capability],
  )
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

const STEPS: Array<ByokCapability> = ['ai:inference', 'ai:web-search']

export function AiProviderConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a provider activates — the gate re-resolves on its own. */
  onConnected?: (pluginId: string, capability: ByokCapability) => void
}) {
  const { t } = useTranslation()
  const { pluginManager, notifyPluginStateChange } = usePairlens()
  const { localizedText, pluginTitle, pluginDescription } = useLocalized()
  const queryClient = useQueryClient()

  const models = useByokProviders('ai:inference')
  const searches = useByokProviders('ai:web-search')

  const [step, setStep] = useState<ByokCapability>('ai:inference')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveStateMutation = useMutation({
    mutationFn: (data: {
      pluginId: string
      enabled: boolean
      config: Record<string, unknown>
    }) => api.setPluginState(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.pluginStates() }),
  })

  const providers = step === 'ai:inference' ? models : searches
  const selected = providers.find((p) => p.manifest.id === selectedId) ?? null
  const modelConnected = models.some((p) => p.connected)

  const openProvider = useCallback((provider: ByokProvider) => {
    const saved = getLedgerEntry(provider.manifest.id)?.config ?? {}
    const next: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(provider.manifest.config)) {
      next[key] =
        saved[key] ?? field.default ?? (field.type === 'boolean' ? false : '')
    }
    setDraft(next)
    setError(null)
    setSelectedId(provider.manifest.id)
  }, [])

  const backToList = useCallback(() => {
    setSelectedId(null)
    setDraft({})
    setError(null)
  }, [])

  const goToStep = useCallback(
    (next: ByokCapability) => {
      backToList()
      setStep(next)
    },
    [backToList],
  )

  // Dismissing resets the whole wizard, so re-opening never lands on a
  // half-filled form for a provider the user backed out of.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        backToList()
        setStep('ai:inference')
      }
      onOpenChange(next)
    },
    [backToList, onOpenChange],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!selected) return
      const { manifest } = selected

      for (const [key, field] of Object.entries(manifest.config)) {
        if (!field.required) continue
        if (String(draft[key] ?? '').trim() !== '') continue
        setError(
          t('pluginStore.fieldRequired', {
            label: localizedText(field.label) ?? key,
          }),
        )
        return
      }

      // A cleared optional field has to be absent, not ''. Providers read
      // their config as `config[key] ?? default`, and `??` treats '' as a
      // value — an emptied Model box would be sent as the model name.
      const config: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(manifest.config)) {
        const value = draft[key]
        if (!field.required && typeof value === 'string' && !value.trim()) {
          continue
        }
        config[key] = value
      }

      setBusy(true)
      setError(null)
      try {
        // Re-activation is a deactivate/activate pair: `initialize` is what
        // reads the key, and it only runs on activate.
        if (selected.connected) {
          await pluginManager.deactivatePlugin(manifest.id)
        }
        await pluginManager.activatePlugin(
          manifest.id,
          buildActivationConfig(manifest.id, config),
        )
        setLedgerEnabled(manifest.id, true)
        setLedgerConfig(manifest.id, config)
        saveStateMutation.mutate({
          pluginId: manifest.id,
          enabled: true,
          config,
        })
        notifyPluginStateChange()
        track('ai_provider_connected', {
          plugin_id: manifest.id,
          capability: step,
        })
        toast.success(
          t('aiProviders.connectedToast', {
            provider: pluginTitle(manifest),
          }),
        )
        onConnected?.(manifest.id, step)
        backToList()
        // The model is what unlocks the panel; search is the optional extra,
        // so a first connection hands the user straight to it instead of
        // closing on a step they never saw.
        if (step === 'ai:inference' && searches.length > 0) {
          setStep('ai:web-search')
        } else {
          onOpenChange(false)
        }
      } catch (err) {
        // A bad key fails here, in `initialize` — which is the whole reason
        // the plugin refuses to activate without one.
        setError(
          err instanceof Error
            ? err.message
            : t('pluginStore.configurationFailed'),
        )
      } finally {
        setBusy(false)
      }
    },
    [
      selected,
      draft,
      step,
      searches.length,
      pluginManager,
      notifyPluginStateChange,
      saveStateMutation,
      localizedText,
      pluginTitle,
      onConnected,
      backToList,
      onOpenChange,
      t,
    ],
  )

  const keyUrl = selected
    ? (KEY_CONSOLE_URLS[selected.manifest.id] ?? selected.manifest.homepage)
    : undefined

  const stepLabel = (capability: ByokCapability) =>
    capability === 'ai:inference'
      ? t('aiProviders.stepModel')
      : t('aiProviders.stepSearch')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-ml-1"
                aria-label={t('common.back')}
                onClick={backToList}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {selected ? pluginTitle(selected.manifest) : t('aiProviders.title')}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? pluginDescription(selected.manifest)
              : t('aiProviders.description')}
          </DialogDescription>
        </DialogHeader>

        {!selected && (
          <>
            {/* Both steps stay reachable: someone who already has a model
                connected is here for search, and vice versa. */}
            <div className="flex gap-1.5">
              {STEPS.map((capability, index) => {
                const active = capability === step
                const done =
                  capability === 'ai:inference'
                    ? modelConnected
                    : searches.some((p) => p.connected)
                return (
                  <button
                    key={capability}
                    type="button"
                    onClick={() => goToStep(capability)}
                    className={cn(
                      'flex flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10'
                        : 'hover:bg-muted/60 border-transparent bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                        done
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted-foreground/20 text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="size-2.5" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {stepLabel(capability)}
                      </span>
                      <span className="text-muted-foreground block text-[10px]">
                        {capability === 'ai:inference'
                          ? t('aiProviders.required')
                          : t('aiProviders.optional')}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="text-muted-foreground -mt-1 text-xs">
              {step === 'ai:inference'
                ? t('aiProviders.modelHint')
                : t('aiProviders.searchHint')}
            </p>
          </>
        )}

        {!selected && providers.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t('aiProviders.noneInstalled')}
          </p>
        )}

        {!selected && providers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {providers.map((provider) => (
              <button
                key={provider.manifest.id}
                type="button"
                onClick={() => openProvider(provider)}
                className="hover:bg-muted/60 flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors"
              >
                <PluginBrandTile
                  id={provider.manifest.id}
                  name={provider.manifest.name}
                  src={provider.manifest.icon}
                  size={36}
                  iconSize={20}
                  className="rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {pluginTitle(provider.manifest)}
                    {provider.connected && (
                      <Badge variant="secondary" className="gap-1 py-0">
                        <Check className="size-3" />
                        {t('aiProviders.connected')}
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground line-clamp-1 block text-xs">
                    {pluginDescription(provider.manifest)}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Closing the wizard on the optional step is a finish, not an
            abandon — say so, once the model is actually connected. */}
        {!selected && step === 'ai:web-search' && modelConnected && (
          <div className="flex justify-end">
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {t('aiProviders.done')}
            </Button>
          </div>
        )}

        {selected && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {Object.entries(selected.manifest.config).map(([key, field]) => (
              <ConfigFieldInput
                key={key}
                fieldKey={key}
                field={field}
                value={draft[key]}
                disabled={busy}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, [key]: value }))
                }
              />
            ))}

            {error && <p className="text-destructive text-xs">{error}</p>}

            <p className="text-muted-foreground text-[11px] leading-snug">
              {t('aiProviders.keyStorageNote')}
            </p>

            <div className="flex items-center justify-between gap-2">
              {keyUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2"
                  onClick={() => void openExternalUrl(keyUrl)}
                >
                  <ExternalLink className="size-3.5" />
                  {t('aiProviders.getKey')}
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={busy}>
                {busy ? t('common.loading') : t('aiProviders.connect')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Host + trigger
// ---------------------------------------------------------------------------

/**
 * The wizard's one mount, in `_terminal.tsx` above the desktop/mobile branch.
 *
 * It cannot live inside the button: connecting a model grants `ai:inference`,
 * the gate re-resolves to 'granted' and unmounts — taking a locally-held
 * dialog with it, mid-wizard, before the optional web-search step is ever
 * seen. Mounted here it simply stays open over the now-live panel.
 */
export function AiSetupDialogHost() {
  const isOpen = useAiSetupStore((s) => s.isOpen)
  const setOpen = useAiSetupStore((s) => s.setOpen)
  return <AiProviderConnectDialog open={isOpen} onOpenChange={setOpen} />
}

/** The affordance the AI gates render under their "or" rule. */
export function ConnectAiProviderButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const open = useAiSetupStore((s) => s.open)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={open}
    >
      <KeyRound className="size-3.5" />
      {t('aiProviders.useOwnKey')}
    </Button>
  )
}

/**
 * The wizard's permanent home, in Settings → Intelligence.
 *
 * The gates are a one-way door: they vanish the moment a key works, so
 * without this there is no way back in to fix a typo'd key or add search
 * later — and on a phone `/plugins` is not reachable at all. Shown signed in
 * or out, because BYOK has nothing to do with the account.
 */
export function AiProvidersSettingsCard() {
  const { t } = useTranslation()
  const { pluginTitle } = useLocalized()
  const open = useAiSetupStore((s) => s.open)
  const models = useByokProviders('ai:inference')
  const searches = useByokProviders('ai:web-search')

  const connectedName = (providers: Array<ByokProvider>) => {
    const active = providers.filter((p) => p.connected)
    return active.length > 0
      ? active.map((p) => pluginTitle(p.manifest)).join(', ')
      : null
  }
  const model = connectedName(models)
  const search = connectedName(searches)

  return (
    <div className="max-w-4xl rounded-xl border p-5">
      <h3 className="font-medium">{t('aiProviders.title')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('aiProviders.description')}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        {(
          [
            [t('aiProviders.stepModel'), model],
            [t('aiProviders.stepSearch'), search],
          ] as const
        ).map(([label, value]) => (
          <div className="flex items-center gap-2" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn(!value && 'text-muted-foreground')}>
              {value ?? t('aiProviders.notConnected')}
            </dd>
          </div>
        ))}
      </dl>
      <Button className="mt-4" onClick={open} type="button" variant="outline">
        <KeyRound className="size-3.5" />
        {model ? t('aiProviders.manage') : t('aiProviders.useOwnKey')}
      </Button>
    </div>
  )
}
