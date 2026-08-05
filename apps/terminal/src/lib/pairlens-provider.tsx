// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { PluginManager } from '@pairlens/plugin-system'
import { LocalPersistenceAdapter } from '@pairlens/persistence'
import {
  registerStepTypes,
  unregisterStepTypes,
} from '@pairlens/workflow-engine/step-registry'
import {
  registerStepTypes as registerNotifStepTypes,
  unregisterStepTypes as unregisterNotifStepTypes,
} from '@pairlens/notification-engine/step-registry'
import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import { toast } from 'sonner'
import type { ComponentType, LazyExoticComponent } from 'react'

import type {
  CapabilityId,
  PluginLifecycleListener,
} from '@pairlens/plugin-system'
import type { PersistenceAdapter } from '@pairlens/persistence'

import type { WorkflowStepTypeDefinition } from '@pairlens/workflow-engine/step-registry'
import type { NotificationStepTypeDefinition } from '@pairlens/notification-engine/step-registry'
import type { CustomIndicatorDescriptor } from '@pairlens/shared/plugin-types'
import type {
  PluginAutoUpdateSettings,
  PluginUpdateInfo,
} from '@/stores/plugin-updates-store'
import type { PluginModule } from '@/lib/plugins/plugin-module-loader'
import i18n from '@/lib/i18n'
import { api, appServerUrl, getSessionToken } from '@/lib/api'
import { hasAppServer } from '@/lib/auth-client'
import { useOptimisticSession } from '@/lib/session'
import { SyncCoordinator } from '@/lib/sync/sync-coordinator'
import {
  DynamicPaneRegistry,
  PaneRegistryContext,
  registerBuiltins,
} from '@/lib/layout/pane-registry'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
import {
  PluginFullTrustRequiredError,
  PluginModuleLoader,
} from '@/lib/plugins/plugin-module-loader'
import {
  clearPendingFullTrust,
  recordPendingFullTrust,
} from '@/stores/plugin-pending-trust-store'
import {
  getInstallableEntries,
  getLedger,
  getLedgerEntry,
  saveLedger,
  seedBootstrap,
  upsertLedgerEntry,
} from '@/lib/plugins/plugin-ledger'
import {
  listLocalPluginIds,
  readLocalPlugin,
} from '@/lib/plugins/local-plugin-store'
import { ServiceRegistry } from '@/lib/service-registry'
import { ServiceRegistryContext } from '@/lib/service-registry-context'
import {
  WorkflowStepRegistry,
  WorkflowStepRegistryContext,
} from '@/lib/workflows/workflow-step-registry'
import {
  NotificationStepRegistry,
  NotificationStepRegistryContext,
} from '@/lib/notifications/notification-step-registry'
import { registerChannelDeliveries } from '@/lib/notifications/channel-deliveries'
import { customIndicatorRegistry } from '@/lib/indicators/custom-indicator-registry'
import { USER_INDICATORS_PLUGIN_ID } from '@/lib/indicators/user-indicators-plugin'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'
import { notificationRuntime } from '@/lib/notifications/notification-runtime'
import { onWindowLeader } from '@/lib/window-leader'
import { startOrderEventAdapter } from '@/lib/notifications/adapters'
import { notificationSubscriptionManager } from '@/lib/notifications/subscription-manager'
import { useNotificationStore } from '@/stores/notification-store'
import { useNotificationLogStore } from '@/stores/notification-log-store'
import { botRuntime } from '@/lib/bots/bot-runtime'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'

// ── Background update check ─────────────────────────────────────────

import {
  addStagedUpdate,
  clearAvailableUpdates,
  clearStagedUpdates,
  getAvailableUpdates,
  getLastUpdateCheck,
  getStagedUpdates,
  setAvailableUpdates,
  setLastUpdateCheck,
} from '@/stores/plugin-updates-store'

// ── First-party component maps ──────────────────────────────────────

const FIRST_PARTY_COMPONENTS: Record<
  string,
  Record<string, LazyExoticComponent<ComponentType>>
> = {
  'pairlens-core': {
    chart: lazy(() =>
      import('@/components/terminal/chart-pane').then((m) => ({
        default: m.ChartPane,
      })),
    ),
    'data-log': lazy(() =>
      import('@/components/terminal/data-log-pane').then((m) => ({
        default: m.DataLogPane,
      })),
    ),
    depth: lazy(() =>
      import('@/components/terminal/depth-pane').then((m) => ({
        default: m.DepthPane,
      })),
    ),
    orderbook: lazy(() =>
      import('@/components/terminal/orderbook-pane').then((m) => ({
        default: m.OrderbookPane,
      })),
    ),
    trades: lazy(() =>
      import('@/components/terminal/trades-pane').then((m) => ({
        default: m.TradesPane,
      })),
    ),
    'pair-info': lazy(() =>
      import('@/components/terminal/pair-info-pane').then((m) => ({
        default: m.PairInfoPane,
      })),
    ),
    'trade-entry': lazy(() =>
      import('@/components/terminal/trade-entry-pane').then((m) => ({
        default: m.TradeEntryPane,
      })),
    ),
    positions: lazy(() =>
      import('@/components/terminal/positions-pane').then((m) => ({
        default: m.PositionsPane,
      })),
    ),
    portfolio: lazy(() =>
      import('@/components/terminal/portfolio-pane').then((m) => ({
        default: m.PortfolioPane,
      })),
    ),
    risk: lazy(() =>
      import('@/components/terminal/risk-pane').then((m) => ({
        default: m.RiskPane,
      })),
    ),
    markets: lazy(() =>
      import('@/components/discovery/markets-pane').then((m) => ({
        default: m.MarketsPane,
      })),
    ),
    watchlist: lazy(() =>
      import('@/components/discovery/watchlist-pane').then((m) => ({
        default: m.WatchlistPane,
      })),
    ),
    'liquidity-heatmap': lazy(() =>
      import('@/components/terminal/liquidity-heatmap-pane').then((m) => ({
        default: m.LiquidityHeatmapPane,
      })),
    ),
    web: lazy(() =>
      import('@/components/web-pane').then((m) => ({
        default: m.WebPane,
      })),
    ),
    'recent-tickers': lazy(() =>
      import('@/components/terminal/recent-tickers-pane').then((m) => ({
        default: m.RecentTickersPane,
      })),
    ),
  },
  'pairlens-intelligence': {
    copilot: lazy(() =>
      import('@/components/terminal/copilot-pane').then((m) => ({
        default: m.CopilotPane,
      })),
    ),
    research: lazy(() =>
      import('@/components/terminal/research-pane').then((m) => ({
        default: m.ResearchPane,
      })),
    ),
    news: lazy(() =>
      import('@/components/discovery/news-pane').then((m) => ({
        default: m.NewsPane,
      })),
    ),
    'symbol-news': lazy(() =>
      import('@/components/terminal/symbol-news-pane').then((m) => ({
        default: m.SymbolNewsPane,
      })),
    ),
    social: lazy(() =>
      import('@/components/terminal/social-pane').then((m) => ({
        default: m.SocialPane,
      })),
    ),
    'top-coins': lazy(() =>
      import('@/components/discovery/top-coins-pane').then((m) => ({
        default: m.TopCoinsPane,
      })),
    ),
    heatmap: lazy(() =>
      import('@/components/discovery/heatmap-pane').then((m) => ({
        default: m.HeatmapPane,
      })),
    ),
    'fear-greed': lazy(() =>
      import('@/components/discovery/fear-greed-pane').then((m) => ({
        default: m.FearGreedPane,
      })),
    ),
  },
}

// ── First-party workflow step component maps ─────────────────────────

type AnyLazy = LazyExoticComponent<ComponentType<any>>

const FIRST_PARTY_WORKFLOW_COMPONENTS: Record<
  string,
  Record<string, AnyLazy>
> = {
  'pairlens-core': {
    trigger: lazy(() =>
      import('@/components/workflows/steps/trigger-step').then((m) => ({
        default: m.TriggerStep,
      })),
    ),
    'market-order': lazy(() =>
      import('@/components/workflows/steps/market-order-step').then((m) => ({
        default: m.MarketOrderStep,
      })),
    ),
    'limit-order': lazy(() =>
      import('@/components/workflows/steps/limit-order-step').then((m) => ({
        default: m.LimitOrderStep,
      })),
    ),
    'take-profit': lazy(() =>
      import('@/components/workflows/steps/take-profit-step').then((m) => ({
        default: m.TakeProfitStep,
      })),
    ),
    'stop-loss': lazy(() =>
      import('@/components/workflows/steps/stop-loss-step').then((m) => ({
        default: m.StopLossStep,
      })),
    ),
    condition: lazy(() =>
      import('@/components/workflows/steps/condition-step').then((m) => ({
        default: m.ConditionStep,
      })),
    ),
    split: lazy(() =>
      import('@/components/workflows/steps/split-step').then((m) => ({
        default: m.SplitStep,
      })),
    ),
    wait: lazy(() =>
      import('@/components/workflows/steps/wait-step').then((m) => ({
        default: m.WaitStep,
      })),
    ),
  },
}

// ── First-party notification step component maps ─────────────────────

const FIRST_PARTY_NOTIFICATION_COMPONENTS: Record<
  string,
  Record<string, AnyLazy>
> = {
  'pairlens-core': {
    'price-alert': lazy(() =>
      import('@/components/notifications/steps/price-alert-step').then((m) => ({
        default: m.PriceAlertStep,
      })),
    ),
    'order-executed': lazy(() =>
      import('@/components/notifications/steps/order-executed-step').then(
        (m) => ({
          default: m.OrderExecutedStep,
        }),
      ),
    ),
    'signal-generated': lazy(() =>
      import('@/components/notifications/steps/signal-generated-step').then(
        (m) => ({
          default: m.SignalGeneratedStep,
        }),
      ),
    ),
    'candle-close': lazy(() =>
      import('@/components/notifications/steps/candle-close-step').then(
        (m) => ({
          default: m.CandleCloseStep,
        }),
      ),
    ),
    'price-condition': lazy(() =>
      import('@/components/notifications/steps/price-condition-step').then(
        (m) => ({
          default: m.PriceConditionStep,
        }),
      ),
    ),
    'percent-change': lazy(() =>
      import('@/components/notifications/steps/percent-change-step').then(
        (m) => ({
          default: m.PercentChangeStep,
        }),
      ),
    ),
    'time-window': lazy(() =>
      import('@/components/notifications/steps/time-window-step').then((m) => ({
        default: m.TimeWindowStep,
      })),
    ),
    'local-toast': lazy(() =>
      import('@/components/notifications/steps/local-toast-step').then((m) => ({
        default: m.LocalToastStep,
      })),
    ),
    'os-notification': lazy(() =>
      import('@/components/notifications/steps/os-notification-step').then(
        (m) => ({
          default: m.OsNotificationStep,
        }),
      ),
    ),
    webhook: lazy(() =>
      import('@/components/notifications/steps/webhook-step').then((m) => ({
        default: m.WebhookStep,
      })),
    ),
  },
}

// ── Context ─────────────────────────────────────────────────────────

type PairlensContextValue = {
  pluginManager: PluginManager
  persistence: PersistenceAdapter
  pluginStateVersion: number
  pluginsReady: boolean
  notifyPluginStateChange: () => void
}

const PairlensContext = createContext<PairlensContextValue | null>(null)

type PairlensProviderProps = {
  enabled?: boolean
  children: React.ReactNode
}

async function fetchAuthToken(): Promise<string> {
  const token = await getSessionToken()
  return typeof token === 'string' ? token : ''
}

// Default Registry URL — used for background update checks
const DEFAULT_REGISTRY_URL = 'https://registry.pairlens.finance'

// ── Provider ────────────────────────────────────────────────────────

export function PairlensProvider({
  children,
  enabled = true,
}: PairlensProviderProps) {
  const [pluginStateVersion, setPluginStateVersion] = useState(0)
  const [pluginsReady, setPluginsReady] = useState(false)
  const notifyPluginStateChange = useCallback(
    () => setPluginStateVersion((v) => v + 1),
    [],
  )
  const managerRef = useRef<PluginManager | null>(null)
  const persistenceRef = useRef<PersistenceAdapter | null>(null)
  const registryRef = useRef<DynamicPaneRegistry | null>(null)
  const serviceRegistryRef = useRef<ServiceRegistry | null>(null)
  const workflowStepRegistryRef = useRef<WorkflowStepRegistry | null>(null)
  const notificationStepRegistryRef = useRef<NotificationStepRegistry | null>(
    null,
  )
  const activatedRef = useRef(false)

  // SyncCoordinator — singleton, bridges localStorage writes to App Server
  const coordinatorRef = useRef<SyncCoordinator | null>(null)
  if (!coordinatorRef.current && hasAppServer) {
    coordinatorRef.current = new SyncCoordinator(appServerUrl, async () => {
      const token = await getSessionToken()
      return typeof token === 'string' ? token : null
    })
  }

  // Wire session changes to the coordinator for pull-and-merge on login
  const { session } = useOptimisticSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    const coordinator = coordinatorRef.current
    if (!coordinator) return
    void coordinator.setSession(session?.user?.id ?? null)
  }, [session?.user?.id])

  // Tie opt-in analytics to the signed-in identity (reset on sign-out).
  useEffect(() => {
    void import('@/lib/analytics').then((m) =>
      m.identifyAnalyticsUser(sessionRef.current?.user?.id ?? null),
    )
  }, [session?.user?.id])

  // The App Server rejected our credentials (401) and `handleUnauthorized` signed
  // the user out — surface a notice so they know to re-authenticate.
  useEffect(() => {
    const onExpired = () => {
      toast.error(i18n.t('common.sessionExpired'), {
        id: 'session-expired',
      })
    }
    window.addEventListener('pairlens:session-expired', onExpired)
    return () =>
      window.removeEventListener('pairlens:session-expired', onExpired)
  }, [])

  // Update AccessProvider auth state and re-fetch entitlements on session
  // change, and again when billing announces a subscription change
  // ('pairlens:entitlements-changed', dispatched after a Pairlens
  // Intelligence checkout or cancellation is detected).
  useEffect(() => {
    const manager = managerRef.current
    // Gate on pluginsReady (state), not activatedRef: this effect runs before
    // the async plugin setup flips the ref, and without a reactive dependency
    // it would bail on first run and never register the listener.
    if (!manager || !pluginsReady) return

    const refreshEntitlements = () => {
      if (!sessionRef.current) {
        // Signed out — clear entitlements
        manager.setAccessProvider({
          isAuthenticated: () => false,
          getAccessLevel: () => null,
        })
        notifyPluginStateChange()
        return
      }
      api
        .getEntitlements()
        .then(({ entitlements }) => {
          const levelMap = new Map(
            entitlements.map((e) => [e.pluginId, e.accessLevel]),
          )
          manager.setAccessProvider({
            isAuthenticated: () => !!sessionRef.current,
            getAccessLevel: (pluginId) => levelMap.get(pluginId) ?? null,
          })
          notifyPluginStateChange()
        })
        .catch(() => {
          // Still set provider with auth=true but no entitlements
          manager.setAccessProvider({
            isAuthenticated: () => !!sessionRef.current,
            getAccessLevel: () => null,
          })
          notifyPluginStateChange()
        })
    }

    refreshEntitlements()
    window.addEventListener(
      'pairlens:entitlements-changed',
      refreshEntitlements,
    )
    return () =>
      window.removeEventListener(
        'pairlens:entitlements-changed',
        refreshEntitlements,
      )
    // re-run when the signed-in user changes or plugins finish activating;
    // manager and callbacks are stable
  }, [session?.user?.id, pluginsReady])

  // Hydrate capability pins on session change. Plugin init races the session
  // fetch on cold load, so pins saved on the server would otherwise be
  // silently skipped when the session resolves after init reads it.
  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return

    if (session) {
      api
        .getPluginPins()
        .then((pins) => {
          for (const pin of pins) {
            manager.pinPlugin(
              pin.capability as CapabilityId,
              pin.market,
              pin.pluginId,
            )
          }
          if (pins.length > 0) notifyPluginStateChange()
        })
        .catch(() => {
          // Offline or App Server unavailable — pins stay local-only
        })
    } else {
      // Signed out — server pins no longer apply on this device
      manager.clearAllPins()
      notifyPluginStateChange()
    }
    // re-run only when the signed-in user changes
  }, [session?.user?.id])

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new PluginManager({
        timeframe: '15m',
        mode: 'paper',
      })
    }
    return managerRef.current
  }, [])

  const getPersistence = useCallback(() => {
    if (!persistenceRef.current) {
      persistenceRef.current = new LocalPersistenceAdapter()
    }
    return persistenceRef.current
  }, [])

  const getRegistry = useCallback(() => {
    if (!registryRef.current) {
      registryRef.current = new DynamicPaneRegistry()
      registerBuiltins(registryRef.current)
    }
    return registryRef.current
  }, [])

  const getServiceRegistry = useCallback(() => {
    if (!serviceRegistryRef.current) {
      serviceRegistryRef.current = new ServiceRegistry()
    }
    return serviceRegistryRef.current
  }, [])

  const getWorkflowStepRegistry = useCallback(() => {
    if (!workflowStepRegistryRef.current) {
      workflowStepRegistryRef.current = new WorkflowStepRegistry()
    }
    return workflowStepRegistryRef.current
  }, [])

  const getNotificationStepRegistry = useCallback(() => {
    if (!notificationStepRegistryRef.current) {
      notificationStepRegistryRef.current = new NotificationStepRegistry()
    }
    return notificationStepRegistryRef.current
  }, [])

  useEffect(() => {
    if (!enabled) return

    const manager = getManager()
    const registry = getRegistry()
    let destroyed = false

    const wsr = getWorkflowStepRegistry()
    const nsr = getNotificationStepRegistry()

    // Lifecycle listener: register/unregister panes + workflow/notification steps when plugins activate/deactivate
    const lifecycleListener: PluginLifecycleListener = {
      onActivated(plugin) {
        // ── Panel registration ──────────────────────────────────────
        try {
          const panels = plugin.manifest.contributes?.panels
          if (panels?.length) {
            const components =
              FIRST_PARTY_COMPONENTS[plugin.manifest.id] ??
              (plugin.getContributedComponents?.() as
                | Record<string, LazyExoticComponent<ComponentType>>
                | undefined) ??
              {}
            registry.registerPluginPanes(plugin.manifest.id, panels, components)
          }
        } catch (err) {
          console.warn(
            `[plugins] Failed to register panels for ${plugin.manifest.id}:`,
            err,
          )
        }

        // ── Workflow step registration ──────────────────────────────
        const hasWorkflowCap = plugin.manifest.capabilities?.some(
          (c) => c.id === 'workflow:step-types',
        )
        if (hasWorkflowCap) {
          plugin
            .execute({
              capability: 'workflow:step-types',
              params: {},
              context: manager.getContext(),
            })
            .then((result) => {
              const definitions = result as Array<WorkflowStepTypeDefinition>
              if (!definitions?.length) return

              // Get components — first-party hardcoded map or third-party via plugin
              const allComponents: Record<string, unknown> =
                FIRST_PARTY_WORKFLOW_COMPONENTS[plugin.manifest.id] ??
                plugin.getContributedComponents?.() ??
                {}

              // Split step components from icon components using :icon convention
              const stepComponents: Record<
                string,
                LazyExoticComponent<ComponentType> | ComponentType
              > = {}
              const iconComponents: Record<
                string,
                ComponentType<{ className?: string }>
              > = {}
              for (const [key, comp] of Object.entries(allComponents)) {
                if (key.endsWith(':icon')) {
                  iconComponents[key.replace(':icon', '')] =
                    comp as ComponentType<{ className?: string }>
                } else {
                  stepComponents[key] = comp as
                    | LazyExoticComponent<ComponentType>
                    | ComponentType
                }
              }

              wsr.registerPluginSteps(
                plugin.manifest.id,
                definitions,
                stepComponents,
                iconComponents,
              )
              // Also register in the global workflow-engine registry for executor access
              registerStepTypes(definitions)
            })
            .catch((err) => {
              console.warn(
                `[plugins] Failed to register workflow steps for ${plugin.manifest.id}:`,
                err,
              )
            })
        }

        // ── Custom chart indicator registration ─────────────────────
        const hasIndicatorCap = plugin.manifest.capabilities?.some(
          (c) => c.id === 'chart:indicator',
        )
        if (hasIndicatorCap) {
          plugin
            .execute({
              capability: 'chart:indicator',
              params: {},
              context: manager.getContext(),
            })
            .then((result) => {
              const descriptors = result as Array<CustomIndicatorDescriptor>
              customIndicatorRegistry.setProviderIndicators(
                plugin.manifest.id,
                Array.isArray(descriptors) ? descriptors : [],
              )
            })
            .catch((err) => {
              console.warn(
                `[plugins] Failed to register custom indicators for ${plugin.manifest.id}:`,
                err,
              )
            })
        }

        // ── Notification channel registration ────────────────────────
        const hasNotifyCap = plugin.manifest.capabilities?.some(
          (c) => c.id === 'notification:channel',
        )
        if (hasNotifyCap) {
          plugin
            .execute({
              capability: 'notification:channel',
              params: {},
              context: manager.getContext(),
            })
            .then((result) => {
              const definitions =
                result as Array<NotificationStepTypeDefinition>
              if (!definitions?.length) return

              const allComponents: Record<string, unknown> =
                FIRST_PARTY_NOTIFICATION_COMPONENTS[plugin.manifest.id] ??
                plugin.getContributedComponents?.() ??
                {}

              const stepComponents: Record<
                string,
                LazyExoticComponent<ComponentType> | ComponentType
              > = {}
              for (const [key, comp] of Object.entries(allComponents)) {
                if (!key.endsWith(':icon')) {
                  stepComponents[key] = comp as
                    | LazyExoticComponent<ComponentType>
                    | ComponentType
                }
              }

              nsr.registerPluginSteps(
                plugin.manifest.id,
                definitions,
                stepComponents,
              )
              registerNotifStepTypes(definitions)
            })
            .catch((err) => {
              console.warn(
                `[plugins] Failed to register notification channels for ${plugin.manifest.id}:`,
                err,
              )
            })
        }
      },
      onDeactivated(pluginId) {
        registry.unregisterPluginPanes(pluginId)
        getServiceRegistry().unregisterAll(pluginId)
        customIndicatorRegistry.removeProvider(pluginId)
        // Unregister workflow steps
        const stepTypes = wsr.getPluginStepTypes(pluginId)
        if (stepTypes) {
          unregisterStepTypes([...stepTypes])
          wsr.unregisterPluginSteps(pluginId)
        }
        // Unregister notification steps
        const notifStepTypes = nsr.getPluginStepTypes(pluginId)
        if (notifStepTypes) {
          unregisterNotifStepTypes([...notifStepTypes])
          nsr.unregisterPluginSteps(pluginId)
        }
      },
      onUninstalled(pluginId) {
        registry.unregisterPluginPanes(pluginId)
        getServiceRegistry().unregisterAll(pluginId)
        customIndicatorRegistry.removeProvider(pluginId)
        const stepTypes = wsr.getPluginStepTypes(pluginId)
        if (stepTypes) {
          unregisterStepTypes([...stepTypes])
          wsr.unregisterPluginSteps(pluginId)
        }
        const notifStepTypes = nsr.getPluginStepTypes(pluginId)
        if (notifStepTypes) {
          unregisterNotifStepTypes([...notifStepTypes])
          nsr.unregisterPluginSteps(pluginId)
        }
      },
    }

    manager.addLifecycleListener(lifecycleListener)

    // Keep the user-indicators provider live: edits in the /indicators page
    // re-collect descriptors so charts and the picker see them immediately.
    const stopScriptsSub = useIndicatorScriptsStore.subscribe(() => {
      const plugin = manager
        .getActivePlugins()
        .find((p) => p.manifest.id === USER_INDICATORS_PLUGIN_ID)
      if (!plugin) return
      plugin
        .execute({
          capability: 'chart:indicator',
          params: {},
          context: manager.getContext(),
        })
        .then((result) => {
          customIndicatorRegistry.setProviderIndicators(
            USER_INDICATORS_PLUGIN_ID,
            Array.isArray(result)
              ? (result as Array<CustomIndicatorDescriptor>)
              : [],
          )
        })
        .catch(() => {})
    })

    const setup = async () => {
      if (activatedRef.current) return

      // ── 1. Seed the ledger with bootstrap plugins (first-run UX) ──
      // Built-in plugins are installed like any other plugin: seeded on first
      // run, uninstallable thereafter (a tombstone keeps them from reappearing).
      seedBootstrap(
        BOOTSTRAP_PLUGINS.map((p) => ({
          pluginId: p.manifest.id,
          version: p.manifest.version,
        })),
      )

      // ── 1a. Install installable bootstrap plugins from compiled code ──
      const bootstrapById = new Map(
        BOOTSTRAP_PLUGINS.map((p) => [p.manifest.id, p]),
      )
      for (const entry of getInstallableEntries()) {
        if (entry.source !== 'bootstrap') continue
        const bp = bootstrapById.get(entry.pluginId)
        if (!bp) continue // bootstrap plugin no longer shipped in this build
        try {
          await manager.installPlugin(bp.manifest, bp.factory)
        } catch {
          // Already installed (e.g. StrictMode double-mount)
        }
      }

      if (destroyed) return

      // ── 1b. Apply staged updates (downloaded in previous session) ──
      const staged = getStagedUpdates()
      if (staged.length > 0) {
        const registryUrl = getRegistryUrl()
        const loader = new PluginModuleLoader(registryUrl)
        loader.setAuthTokenProvider(fetchAuthToken)

        for (const update of staged) {
          try {
            // Try to load the cached (newer) module
            const cachedModule = await loader.loadCached(update.pluginId)
            if (!cachedModule) continue

            // Replace the bootstrap version with the cached one
            await manager.uninstallPlugin(update.pluginId)
            await manager.installPlugin(
              cachedModule.manifest,
              cachedModule.factory,
            )
            console.info(
              `[plugins] Applied staged update: ${update.pluginId} → v${update.version}`,
            )
          } catch {
            // Failed to apply staged update — keep the bootstrap version
          }
        }
        clearStagedUpdates()
        clearAvailableUpdates()
      }

      if (destroyed) return

      // ── 1b2. Scan the local plugins folder (desktop) ──────────────
      // Folders dropped into <app-data>/plugins/ are discovered here and
      // recorded in the ledger so they install like any other plugin.
      {
        const localIds = await listLocalPluginIds()
        for (const id of localIds) {
          const files = await readLocalPlugin(id)
          if (!files) continue
          let version = '0.0.0'
          try {
            version =
              (JSON.parse(files.manifest) as { version?: string }).version ??
              '0.0.0'
          } catch {
            continue // malformed manifest.json — skip
          }
          const existing = getLedgerEntry(id)
          if (existing?.tombstoned) continue
          if (!existing) {
            upsertLedgerEntry({
              pluginId: id,
              source: 'local',
              enabled: true,
              version,
            })
          }
        }
        if (destroyed) return
      }

      // ── 1c. Install previously-installed remote/local plugins ─────
      // Registry/URL plugins have their code in the IndexedDB cache; local
      // plugins are read fresh from disk (the folder is the source of truth).
      // Bootstrap plugins are already installed above.
      {
        const registryUrl = getRegistryUrl()
        const loader = new PluginModuleLoader(registryUrl)
        loader.setAuthTokenProvider(fetchAuthToken)
        for (const entry of getInstallableEntries()) {
          if (entry.source === 'bootstrap') continue
          const already = manager
            .getInstalledPlugins()
            .some((p) => p.manifest.id === entry.pluginId)
          if (already) continue
          try {
            const mod =
              entry.source === 'local'
                ? await loadLocalModule(loader, entry.pluginId)
                : await loader.loadCached(entry.pluginId)
            if (!mod) {
              console.warn(
                `[plugins] No cached module for '${entry.pluginId}' at boot — skipping (reinstall from the store to restore it)`,
              )
              continue
            }
            await manager.installPlugin(mod.manifest, mod.factory)
            clearPendingFullTrust(entry.pluginId)
          } catch (err) {
            if (err instanceof PluginFullTrustRequiredError) {
              // Can't load sandboxed and needs the main realm — surface it so
              // the user can grant full trust from Installed Plugins rather than
              // leaving the plugin silently stuck with no row.
              recordPendingFullTrust({
                pluginId: entry.pluginId,
                version: entry.version,
                source: entry.source as 'registry' | 'url' | 'local',
              })
            } else {
              // Module missing/invalid — skip; user can reinstall
              console.warn(
                `[plugins] Failed to restore '${entry.pluginId}' at boot:`,
                err instanceof Error ? err.message : err,
              )
            }
          }
          if (destroyed) return
        }
      }

      if (destroyed) return

      // ── 2. Fetch saved states, pins, entitlements (parallel) ──────
      const isSignedIn = !!sessionRef.current
      const emptyStates = [] as Array<{
        pluginId: string
        enabled: boolean
        config: Record<string, unknown>
      }>
      const emptyPins = [] as Array<{
        capability: string
        market: string
        pluginId: string
      }>
      const emptyEntitlements = {
        entitlements: [] as Array<{
          pluginId: string
          accessLevel: string
        }>,
      }

      const statesPromise =
        hasAppServer && isSignedIn
          ? api.getPluginStates().catch(() => emptyStates)
          : Promise.resolve(emptyStates)
      const pinsPromise =
        hasAppServer && isSignedIn
          ? api.getPluginPins().catch(() => emptyPins)
          : Promise.resolve(emptyPins)
      const entitlementsPromise =
        hasAppServer && isSignedIn
          ? api.getEntitlements().catch(() => emptyEntitlements)
          : Promise.resolve(emptyEntitlements)

      const savedStates = await statesPromise
      if (destroyed) return

      // ── 3. Merge server state into the local ledger ───────────────
      // The local ledger is the device source of truth; the App Server provides
      // enabled/config for plugins the user has not uninstalled on this device.
      if (savedStates.length > 0) {
        const ledger = getLedger()
        for (const s of savedStates) {
          const entry = ledger[s.pluginId]
          if (!entry || entry.tombstoned) continue
          entry.enabled = s.enabled
          entry.config = s.config
        }
        saveLedger(ledger)
      }
      // Legacy basic-symbols → pairlens-core (config-only migration)
      const legacyBasicState = savedStates.find(
        (s) => s.pluginId === 'basic-symbols',
      )
      if (legacyBasicState) {
        const ledger = getLedger()
        const core = ledger['pairlens-core']
        if (core && Object.keys(core.config).length === 0) {
          core.config = legacyBasicState.config
          saveLedger(ledger)
        }
        if (hasAppServer && isSignedIn) {
          api.removePluginState('basic-symbols').catch(() => {})
        }
      }

      // ── 4. Activate plugins by category, honoring ledger state ────
      const ledgerSnapshot = getLedger()
      const isEnabled = (id: string): boolean => {
        const e = ledgerSnapshot[id]
        return !!e && !e.tombstoned && e.enabled
      }
      const cfgOf = (id: string): Record<string, unknown> =>
        ledgerSnapshot[id]?.config ?? {}

      const officialConfig = {
        appServerUrl: appServerUrl,
        authToken: fetchAuthToken,
      }

      // pairlens-core
      if (isEnabled('pairlens-core')) {
        try {
          await manager.activatePlugin('pairlens-core', cfgOf('pairlens-core'))
        } catch {
          // Activation failed — leave installed
        }
      }
      if (destroyed) return

      // pairlens-intelligence
      if (isEnabled('pairlens-intelligence')) {
        try {
          await manager.activatePlugin('pairlens-intelligence', {
            ...officialConfig,
            ...cfgOf('pairlens-intelligence'),
            authToken: fetchAuthToken,
          })
        } catch {
          // Activation failed — leave installed
        }
      }
      if (destroyed) return

      // pairlens-community — the first-party workspace store (workspace-store:catalog)
      if (isEnabled('pairlens-community')) {
        try {
          await manager.activatePlugin('pairlens-community', {
            ...officialConfig,
            ...cfgOf('pairlens-community'),
          })
        } catch {
          // Activation failed — leave installed
        }
      }
      if (destroyed) return

      // theme plugins
      const THEME_IDS = BOOTSTRAP_PLUGINS.filter((p) =>
        p.manifest.capabilities.some((c) => c.id === 'theme:override'),
      ).map((p) => p.manifest.id)
      for (const themeId of THEME_IDS) {
        if (!isEnabled(themeId)) continue
        try {
          await manager.activatePlugin(themeId, cfgOf(themeId))
        } catch {
          // Already active or missing — skip
        }
        if (destroyed) return
      }

      // market connector + DEX data provider plugins
      const MARKET_CONNECTOR_IDS = BOOTSTRAP_PLUGINS.filter((p) =>
        p.manifest.capabilities.some(
          (c) =>
            c.id === 'market-data:candles' ||
            (c.id === 'market-data:discovery' && !c.markets.includes('*')),
        ),
      ).map((p) => p.manifest.id)
      for (const connectorId of MARKET_CONNECTOR_IDS) {
        if (!isEnabled(connectorId)) continue
        try {
          await manager.activatePlugin(connectorId, cfgOf(connectorId))
        } catch {
          // Already active or missing — skip
        }
        if (destroyed) return
      }

      // ── 6. Apply pins ─────────────────────────────────────────────
      const savedPins = await pinsPromise
      for (const pin of savedPins) {
        manager.pinPlugin(
          pin.capability as CapabilityId,
          pin.market,
          pin.pluginId,
        )
      }

      // ── 7. Wire AccessProvider ────────────────────────────────────
      const { entitlements } = await entitlementsPromise
      const levelMap = new Map(
        entitlements.map((e) => [e.pluginId, e.accessLevel]),
      )
      manager.setAccessProvider({
        isAuthenticated: () => !!sessionRef.current,
        getAccessLevel: (pluginId) => levelMap.get(pluginId) ?? null,
      })

      // ── 8. Plugins ready ──────────────────────────────────────────
      activatedRef.current = true
      setPluginsReady(true)
      notifyPluginStateChange()

      // ── 9. Activate remaining enabled plugins ─────────────────────
      const autoActivated = new Set([
        'pairlens-core',
        'pairlens-intelligence',
        ...THEME_IDS,
        ...MARKET_CONNECTOR_IDS,
      ])
      for (const entry of getInstallableEntries()) {
        if (autoActivated.has(entry.pluginId) || !entry.enabled) continue
        // Skip plugins that aren't actually installed into the manager
        const installed = manager
          .getInstalledPlugins()
          .some((p) => p.manifest.id === entry.pluginId)
        if (!installed) continue
        try {
          await manager.activatePlugin(entry.pluginId, entry.config)
        } catch (err) {
          // Plugin activation failed — skip, don't block boot
          console.warn(
            `[plugins] Boot activation failed for '${entry.pluginId}':`,
            err instanceof Error ? err.message : err,
          )
        }
        if (destroyed) return
      }
      // Step 8's notify fired BEFORE this loop — bump again so capability-
      // derived UI (theme picker, capability pins) sees plugins activated here
      // (e.g. registry-installed themes restored from cache).
      notifyPluginStateChange()

      // ── 10. Start background update scheduler ────────────────────
      if (!destroyed) {
        stopUpdateScheduler = startUpdateCheckScheduler(manager)
      }

      // ── 11. Initialize notification system ─────────────────────────
      if (!destroyed) {
        // Register core notification steps in the global engine registry
        // (needed by evaluator, validator, and addStepAtPosition)
        registerNotifStepTypes(CORE_NOTIFICATION_STEPS)
        // Register core notification steps with first-party UI components
        nsr.registerCoreSteps(
          FIRST_PARTY_NOTIFICATION_COMPONENTS['pairlens-core'] ?? {},
        )
        // Register concrete channel delivery implementations (overrides stubs)
        registerChannelDeliveries()
        // Load rules/bindings in every window (the editor UI needs them),
        // but run evaluation + delivery only in the leader window — with
        // multiple windows open, each one streams the same candles, so
        // unguarded runtimes would fire every alert once per window. When
        // the leader window closes, the next window takes over via the
        // window-leader lock.
        const notifStore = useNotificationStore.getState()
        notifStore.load()
        useNotificationLogStore.getState().load()
        stopLeaderSub = onWindowLeader((isLeader) => {
          if (!isLeader || destroyed) return
          notificationRuntime.start(
            () => useNotificationStore.getState().rules,
            () => useNotificationStore.getState().bindings,
            (entry) => useNotificationLogStore.getState().append(entry),
          )
          stopOrderAdapter = startOrderEventAdapter()
          notificationSubscriptionManager.start(manager)
          // Trading bots are leader-gated for a harder reason than alerts:
          // N windows running the runtime would place N copies of every
          // order, on real money. The stores load here (rather than in the
          // runtime) so the bots UI works in follower windows too.
          useBotsStore.getState().load()
          useBotRunsStore.getState().load()
          botRuntime.start(manager)
        })
      }
    }

    let stopUpdateScheduler: (() => void) | undefined
    let stopOrderAdapter: (() => void) | undefined
    let stopLeaderSub: (() => void) | undefined

    void setup().catch((err) => {
      // Plugin setup failure is non-fatal — core UI still works
      console.warn('[plugins] Plugin boot failed:', err)
    })

    return () => {
      destroyed = true
      activatedRef.current = false
      manager.removeLifecycleListener(lifecycleListener)
      stopScriptsSub()
      stopUpdateScheduler?.()
      stopLeaderSub?.()
      stopOrderAdapter?.()
      notificationRuntime.stop()
      notificationSubscriptionManager.stop()
      botRuntime.stop()
      coordinatorRef.current?.destroy()
      coordinatorRef.current = null
    }
  }, [enabled, getManager, getRegistry, notifyPluginStateChange])

  const registry = getRegistry()
  const serviceRegistry = getServiceRegistry()
  const workflowStepRegistry = getWorkflowStepRegistry()
  const notificationStepRegistry = getNotificationStepRegistry()

  const contextValue = useMemo<PairlensContextValue>(
    () => ({
      pluginManager: getManager(),
      persistence: getPersistence(),
      pluginStateVersion,
      pluginsReady,
      notifyPluginStateChange,
    }),
    [
      pluginStateVersion,
      pluginsReady,
      notifyPluginStateChange,
      getManager,
      getPersistence,
    ],
  )

  return (
    <PairlensContext.Provider value={contextValue}>
      <ServiceRegistryContext.Provider value={serviceRegistry}>
        <PaneRegistryContext.Provider value={registry}>
          <WorkflowStepRegistryContext.Provider value={workflowStepRegistry}>
            <NotificationStepRegistryContext.Provider
              value={notificationStepRegistry}
            >
              {children}
            </NotificationStepRegistryContext.Provider>
          </WorkflowStepRegistryContext.Provider>
        </PaneRegistryContext.Provider>
      </ServiceRegistryContext.Provider>
    </PairlensContext.Provider>
  )
}

/**
 * Load a local-folder plugin's module from disk (desktop). Returns null on web
 * or if the folder is missing/invalid.
 */
async function loadLocalModule(
  loader: PluginModuleLoader,
  pluginId: string,
): Promise<PluginModule | null> {
  const files = await readLocalPlugin(pluginId)
  if (!files) return null
  return loader.loadModuleWithStyle(
    files.module_text,
    files.style_text,
    pluginId,
  )
}

function getRegistryUrl(): string {
  try {
    const raw = localStorage.getItem('plugin-registry-settings')
    if (raw) {
      const s = JSON.parse(raw)
      if (s.mode === 'custom' && s.customUrl && s.customAcknowledged) {
        return s.customUrl
      }
    }
  } catch {
    // Fall through
  }
  return DEFAULT_REGISTRY_URL
}

function getAutoUpdateSettings(): PluginAutoUpdateSettings {
  try {
    const raw = localStorage.getItem('plugin-auto-update-settings')
    if (raw) return JSON.parse(raw) as PluginAutoUpdateSettings
  } catch {
    // Fall through
  }
  return { mode: 'notify', checkIntervalHours: 6 }
}

function showRestartToast(count: number): void {
  toast.info(i18n.t('connection.pluginUpdatesReady', { count }), {
    description: i18n.t('connection.pluginUpdatesDescription'),
    duration: Infinity,
    id: 'plugin-updates-staged',
    action: {
      label: i18n.t('connection.restartNow'),
      onClick: () => window.location.reload(),
    },
    cancel: {
      label: i18n.t('connection.later'),
      onClick: () => toast.dismiss('plugin-updates-staged'),
    },
  })
}

async function runUpdateCheck(manager: PluginManager): Promise<void> {
  const settings = getAutoUpdateSettings()
  if (settings.mode === 'off') return

  // Respect check interval
  const now = Date.now()
  const last = getLastUpdateCheck()
  const intervalMs = settings.checkIntervalHours * 60 * 60 * 1000
  if (now - last < intervalMs) return

  setLastUpdateCheck(now)

  const registryUrl = getRegistryUrl()
  const loader = new PluginModuleLoader(registryUrl)
  loader.setAuthTokenProvider(fetchAuthToken)

  const installed = manager.getInstalledPlugins()
  const foundUpdates: Array<PluginUpdateInfo> = []

  for (const plugin of installed) {
    const update = await loader.checkForUpdate(
      plugin.manifest.id,
      plugin.manifest.version,
    )
    if (update) {
      foundUpdates.push({
        pluginId: plugin.manifest.id,
        currentVersion: update.currentVersion,
        latestVersion: update.latestVersion,
        moduleUrl: update.moduleUrl,
        moduleHash: update.moduleHash,
        styleUrl: update.styleUrl,
        styleHash: update.styleHash,
        signature: update.signature,
        publisherKeyId: update.publisherKeyId,
      })
    }
  }

  if (foundUpdates.length === 0) return

  // Merge with existing (don't lose updates the user hasn't acted on)
  const existing = getAvailableUpdates()
  const merged = new Map(existing.map((u) => [u.pluginId, u]))
  for (const u of foundUpdates) merged.set(u.pluginId, u)
  setAvailableUpdates(Array.from(merged.values()))

  if (settings.mode === 'auto') {
    // Auto mode: download + cache new versions, stage for next boot
    let stagedCount = 0
    for (const update of foundUpdates) {
      try {
        const plugin = installed.find((p) => p.manifest.id === update.pluginId)
        if (!plugin) continue

        // Download and cache the new module (but do NOT activate it).
        // manifest.version must be the NEW version: fetchAndCache verifies the
        // signature over {id, version, hashes}, and evaluateModule checks the
        // module's own manifest matches this expected id+version.
        const entry = {
          manifest: { ...plugin.manifest, version: update.latestVersion },
          category: '',
          tagline: '',
          moduleUrl: update.moduleUrl,
          moduleHash: update.moduleHash,
          styleUrl: update.styleUrl,
          styleHash: update.styleHash,
          signature: update.signature,
          publisherKeyId: update.publisherKeyId,
        }
        await loader.fetchAndCache(entry)

        // Mark as staged — will be loaded from cache on next boot
        addStagedUpdate({
          pluginId: update.pluginId,
          version: update.latestVersion,
          stagedAt: Date.now(),
        })
        stagedCount++

        console.info(
          `[plugins] Staged update: ${update.pluginId} ${update.currentVersion} → ${update.latestVersion}`,
        )
      } catch (err) {
        console.warn(
          `[plugins] Failed to stage update for ${update.pluginId}:`,
          err,
        )
      }
    }

    if (stagedCount > 0) {
      showRestartToast(stagedCount)
    }
  } else {
    // Notify mode: just log + badge is already shown via available updates
    console.info(
      `[plugins] ${foundUpdates.length} update(s) available — check the Plugins page`,
    )
  }
}

/** Run the update check once, then schedule recurring checks. */
function startUpdateCheckScheduler(manager: PluginManager): () => void {
  // Initial check (delayed 10s to not compete with boot)
  const initialTimeout = setTimeout(() => {
    void runUpdateCheck(manager).catch(() => {})
  }, 10_000)

  // Recurring check every hour — the check itself respects the user's interval setting
  const interval = setInterval(
    () => {
      void runUpdateCheck(manager).catch(() => {})
    },
    60 * 60 * 1000,
  )

  return () => {
    clearTimeout(initialTimeout)
    clearInterval(interval)
  }
}

// ── Hooks ───────────────────────────────────────────────────────────

export function usePairlens() {
  const context = useContext(PairlensContext)
  if (!context) {
    throw new Error('usePairlens must be used within PairlensProvider')
  }
  return context
}

export function usePluginManager() {
  return usePairlens().pluginManager
}

export function usePersistence() {
  return usePairlens().persistence
}
