// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A sealed vault must PARK live bots, never halt them.
 *
 * `halt()` disables the bot definition. Reaching it because the vault came
 * back sealed after a reboot would turn "I restarted my laptop" into "all my
 * bots are off and nobody told me" — the definition would need re-arming by
 * hand, and the user would have no reason to suspect anything happened. So:
 * status says why, `enabled` stays true, the attention store drives a banner,
 * and unlocking resumes the bot on its own.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'

import type { BotDefinition } from '@pairlens/bot-engine/types'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { PluginManager } from '@pairlens/plugin-system'

import { installBrowserGlobals } from '@/lib/security/vault/__tests__/test-globals'

installBrowserGlobals()

class FakeBusyError extends Error {}

// `mock.module` is process-global in bun — capture the real module and restore
// it (spread, never the raw namespace) so the Pyodide-backed tests that run
// after this file still see their own implementation.
const realBotPython = { ...(await import('../bot-python')) }

afterAll(() => {
  mock.module('../bot-python', () => realBotPython)
})

mock.module('../bot-python', () => ({
  BOT_WINDOW_BARS: 500,
  BOT_COMPUTE_TIMEOUT_MS: 10_000,
  BotComputeBusyError: FakeBusyError,
  botScriptKey: (botId: string) => `bot:${botId}`,
  disposeBotScript: async () => {},
  resetBotPythonState: () => {},
  computeBotOutputs: async (request: { bars: Array<ChartBar> }) => ({
    position: new Float64Array(request.bars.length),
  }),
}))

const { BotRuntime } = await import('../bot-runtime')
const { setBotOrderSource } = await import('../bot-order-source')
const { useBotRunsStore } = await import('@/stores/bot-runs-store')
const { useBotsStore } = await import('@/stores/bots-store')
const { useCredentialsStore } = await import('@/stores/credentials-store')
const { useIndicatorScriptsStore } =
  await import('@/stores/indicator-scripts-store')
const { useVaultAttentionStore } =
  await import('@/stores/vault-attention-store')
const { __resetVaultSessionForTests, setDek, setVaultRecord } =
  await import('@/lib/security/vault/vault-session')
const { VAULT_RECORD_VERSION } =
  await import('@/lib/security/vault/vault-record')

const START = 1_700_000_000_000
const BOT_ID = 'bot-1'

const meta: CustomIndicatorMeta = {
  id: 'test-strategy',
  title: 'Test Strategy',
  pane: 'overlay',
  inputs: [],
  series: [],
  strategy: {
    initialCapital: 10_000,
    positionSize: 1,
    fee: 0,
    slippage: 0,
    allowShort: false,
  },
}

const definition = (over: Partial<BotDefinition> = {}): BotDefinition => ({
  id: BOT_ID,
  name: 'Test bot',
  scriptId: 'script-1',
  params: {},
  market: 'okx',
  pair: 'BTC-USDT',
  timeframe: '1h',
  mode: 'live',
  sizing: { kind: 'percent-equity', value: 0.1 },
  guards: {},
  enabled: true,
  createdAt: START,
  updatedAt: START,
  ...over,
})

let feed: ((data: unknown) => void) | null = null

const manager = {
  setContext: () => {},
  subscribe: (
    _capability: string,
    _params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ) => {
    feed = callback
    return () => undefined
  },
} as unknown as PluginManager

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const run = () => useBotRunsStore.getState().getRun(BOT_ID)
const bot = () => useBotsStore.getState().bots.find((b) => b.id === BOT_ID)!

function vaultRecord() {
  return {
    v: VAULT_RECORD_VERSION as 1,
    state: 'ready' as const,
    revision: 1,
    prfSalt: 'c2FsdA==',
    webauthnUserId: 'dXNlcg==',
    createdAt: 1,
    protectors: [
      {
        id: 'p1',
        type: 'password' as const,
        createdAt: 1,
        label: 'Password',
        kdf: 'PBKDF2-SHA256' as const,
        iterations: 1000,
        salt: 'c2FsdA==',
        iv: 'aXY=',
        wrapped: 'dw==',
      },
    ],
  }
}

async function fakeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

let runtime: InstanceType<typeof BotRuntime>

/**
 * The store's own actions, so a test can stand `reload()` down and drive the
 * post-unlock refill by hand. That refill really is asynchronous — it is the
 * whole race under test — and against this fake keychain the real one would
 * simply resolve to "no credentials".
 */
const credentialActions = {
  load: useCredentialsStore.getState().load,
  reload: useCredentialsStore.getState().reload,
}

const liveCredential = {
  id: 'cred-1',
  market: 'okx',
  label: 'OKX Live',
  mode: 'live' as const,
  apiKey: 'k',
  apiSecret: 's',
  createdAt: START,
}

beforeEach(() => {
  feed = null
  __resetVaultSessionForTests()
  useVaultAttentionStore.setState({ parked: [], dismissed: false })
  useCredentialsStore.setState({ ...credentialActions })

  useIndicatorScriptsStore.setState({
    scripts: [
      {
        id: 'script-1',
        name: 'Test Strategy',
        source: 'meta = strategy()',
        meta,
        metaError: null,
        createdAt: START,
        updatedAt: START,
      },
    ],
    loaded: true,
  })
  useBotsStore.setState({ bots: [definition()], loaded: true })
  useBotRunsStore.setState({ runs: {}, loaded: true })
  // A live credential exists — so anything that stops the bot below is the
  // vault, not the missing-credential path.
  useCredentialsStore.setState({
    credentials: [
      {
        id: 'cred-1',
        market: 'okx',
        label: 'OKX Live',
        mode: 'live',
        apiKey: 'k',
        apiSecret: 's',
        createdAt: START,
      },
    ],
    loaded: true,
    status: 'ready',
    sealed: false,
  })

  setBotOrderSource({
    placeOrder: async () => ({ success: true, orderId: 'o-1' }),
    fetchHistory: async () => [],
    getLastPrice: () => null,
  })

  runtime = new BotRuntime()
})

afterEach(() => {
  runtime.stop()
  setBotOrderSource(null)
  __resetVaultSessionForTests()
})

describe('a sealed vault parks live bots', () => {
  it('parks instead of halting, and never clears `enabled`', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()

    expect(run().status).toBe('waiting-unlock')
    // The rule that matters: halting would set this false and the bot would
    // need re-arming by hand.
    expect(bot().enabled).toBe(true)
    expect(feed).toBeNull()
  })

  it('reports the bot to the attention store so it is visible', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()

    expect(useVaultAttentionStore.getState().parked).toEqual([
      { id: BOT_ID, label: 'Test bot' },
    ])
  })

  it('resumes on unlock without the user touching anything', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()
    expect(run().status).toBe('waiting-unlock')

    setDek(await fakeDek(), { broadcast: false, proven: true })
    await flush()

    expect(feed).not.toBeNull()
    expect(run().status).toBe('warming-up')
    expect(useVaultAttentionStore.getState().parked).toEqual([])
  })

  it('an unlock that outruns the credential reload still does not disarm', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()
    expect(run().status).toBe('waiting-unlock')

    // The shape a sealed vault actually leaves behind: nothing in memory,
    // `sealed` rather than `ready`. Refilling it is an async reload, so the
    // vault listener — which runs synchronously inside `setDek` — sees this.
    useCredentialsStore.setState({
      credentials: [],
      loaded: true,
      status: 'sealed',
      sealed: true,
      reload: async () => {},
    })
    await flush()

    setDek(await fakeDek(), { broadcast: false, proven: true })
    await flush()

    // Halting here would clear `enabled`, and re-arming means typing ARM LIVE
    // again — for a user who just successfully unlocked.
    expect(bot().enabled).toBe(true)
    expect(feed).toBeNull()

    // …and when the reload lands, the bot resumes on its own.
    useCredentialsStore.setState({
      credentials: [liveCredential],
      loaded: true,
      status: 'ready',
      sealed: false,
    })
    await flush()

    expect(feed).not.toBeNull()
    expect(run().status).toBe('warming-up')
  })

  it('a credential read that failed parks too, and asks for no unlock', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()

    // A keychain read that threw for any non-vault reason lands here. It is
    // still not "the user has no credential".
    useCredentialsStore.setState({
      credentials: [],
      loaded: true,
      status: 'error',
      sealed: false,
      reload: async () => {},
    })
    setDek(await fakeDek(), { broadcast: false, proven: true })
    await flush()

    expect(bot().enabled).toBe(true)
    expect(feed).toBeNull()
    expect(run().statusDetail).toContain('could not be read')
    // No unlock banner: unlocking is not what fixes an unreadable keychain.
    expect(useVaultAttentionStore.getState().parked).toEqual([])
  })

  it('leaves paper bots alone — the vault only gates live orders', async () => {
    useBotsStore.setState({
      bots: [definition({ mode: 'paper' })],
      loaded: true,
    })
    setVaultRecord(vaultRecord(), { broadcast: false })
    runtime.start(manager)
    await flush()

    expect(feed).not.toBeNull()
    expect(run().status).toBe('warming-up')
    expect(useVaultAttentionStore.getState().parked).toEqual([])
  })

  it('an unlocked vault is no obstacle at all', async () => {
    setVaultRecord(vaultRecord(), { broadcast: false })
    setDek(await fakeDek(), { broadcast: false, proven: true })
    runtime.start(manager)
    await flush()

    expect(feed).not.toBeNull()
    expect(run().status).toBe('warming-up')
  })

  it('with no vault enrolled nothing changes', async () => {
    runtime.start(manager)
    await flush()
    expect(feed).not.toBeNull()
  })
})
