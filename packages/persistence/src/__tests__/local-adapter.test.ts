// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'
import { LocalPersistenceAdapter } from '../local-adapter'
import type {
  ChartState,
  RiskState,
  Signal,
  TradeJournalEntry,
  UserConfig,
  WatchlistsState,
  WorkspaceLayout,
} from '../types'

// Helper: create a fresh adapter for each test
function makeAdapter(): LocalPersistenceAdapter {
  return new LocalPersistenceAdapter()
}

// Helper: create a minimal Signal
function makeSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    market: 'okx',
    pairKey: 'BTC-USDT',
    timeframe: '1h',
    strategy: 'rsi-divergence',
    direction: 'long',
    confidence: 0.85,
    regime: 'trending',
    aiStatus: 'pending',
    payload: {},
    createdAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// User Config
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — user config', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('returns null initially', async () => {
    const config = await adapter.getUserConfig('user-1')
    expect(config).toBeNull()
  })

  it('creates config on first update', async () => {
    await adapter.updateUserConfig('user-1', { aiPersona: 'technical' })
    const config = await adapter.getUserConfig('user-1')
    expect(config).not.toBeNull()
    expect(config?.aiPersona).toBe('technical')
  })

  it('merges patches without overwriting unrelated fields', async () => {
    await adapter.updateUserConfig('user-1', {
      aiPersona: 'mentor',
      tradingMode: 'live',
    })
    await adapter.updateUserConfig('user-1', { preferences: { theme: 'nord' } })

    const config = await adapter.getUserConfig('user-1')
    expect(config?.aiPersona).toBe('mentor')
    expect(config?.tradingMode).toBe('live')
    expect(config?.preferences).toEqual({ theme: 'nord' })
  })

  it('isolates config by userId', async () => {
    await adapter.updateUserConfig('user-1', { aiPersona: 'technical' })
    await adapter.updateUserConfig('user-2', { aiPersona: 'mentor' })

    const c1 = await adapter.getUserConfig('user-1')
    const c2 = await adapter.getUserConfig('user-2')
    expect(c1?.aiPersona).toBe('technical')
    expect(c2?.aiPersona).toBe('mentor')
  })
})

// ---------------------------------------------------------------------------
// Risk State
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — risk state', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('returns null initially', async () => {
    const state = await adapter.getRiskState('user-1')
    expect(state).toBeNull()
  })

  it('creates and retrieves risk state', async () => {
    await adapter.updateRiskState('user-1', {
      dailyPnl: -50,
      maxDailyLoss: 200,
    })
    const state = await adapter.getRiskState('user-1')
    expect(state?.dailyPnl).toBe(-50)
    expect(state?.maxDailyLoss).toBe(200)
  })

  it('fires subscription callback when state updates', async () => {
    const received: Array<RiskState> = []
    const unsub = adapter.subscribeRiskState('user-1', (s) => received.push(s))

    await adapter.updateRiskState('user-1', { dailyPnl: 100 })
    await adapter.updateRiskState('user-1', { dailyPnl: 200 })

    expect(received).toHaveLength(2)
    expect(received[0]?.dailyPnl).toBe(100)
    expect(received[1]?.dailyPnl).toBe(200)

    unsub()
  })

  it('unsubscribing stops callbacks', async () => {
    const received: Array<RiskState> = []
    const unsub = adapter.subscribeRiskState('user-1', (s) => received.push(s))

    await adapter.updateRiskState('user-1', { dailyPnl: 100 })
    unsub()
    await adapter.updateRiskState('user-1', { dailyPnl: 200 })

    expect(received).toHaveLength(1)
  })

  it('does not fire subscription for a different userId', async () => {
    const received: Array<RiskState> = []
    adapter.subscribeRiskState('user-2', (s) => received.push(s))

    await adapter.updateRiskState('user-1', { dailyPnl: 100 })

    expect(received).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — signals', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('returns empty array when no signals exist', async () => {
    const signals = await adapter.getSignals({ userId: 'user-1' })
    expect(signals).toEqual([])
  })

  it('appends and retrieves a signal', async () => {
    const signal = makeSignal()
    await adapter.appendSignal(signal)
    const result = await adapter.getSignals({ userId: 'user-1' })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(signal.id)
  })

  it('filters signals by market', async () => {
    await adapter.appendSignal(makeSignal({ market: 'okx' }))
    await adapter.appendSignal(makeSignal({ market: 'binance' }))

    const okx = await adapter.getSignals({ userId: 'user-1', market: 'okx' })
    const binance = await adapter.getSignals({
      userId: 'user-1',
      market: 'binance',
    })

    expect(okx).toHaveLength(1)
    expect(binance).toHaveLength(1)
  })

  it('filters signals by pairKey', async () => {
    await adapter.appendSignal(makeSignal({ pairKey: 'BTC-USDT' }))
    await adapter.appendSignal(makeSignal({ pairKey: 'ETH-USDT' }))

    const btc = await adapter.getSignals({
      userId: 'user-1',
      pairKey: 'BTC-USDT',
    })
    expect(btc).toHaveLength(1)
    expect(btc[0]?.pairKey).toBe('BTC-USDT')
  })

  it('filters signals by timeframe', async () => {
    await adapter.appendSignal(makeSignal({ timeframe: '1h' }))
    await adapter.appendSignal(makeSignal({ timeframe: '4h' }))

    const oneH = await adapter.getSignals({ userId: 'user-1', timeframe: '1h' })
    expect(oneH).toHaveLength(1)
    expect(oneH[0]?.timeframe).toBe('1h')
  })

  it('respects limit on getSignals', async () => {
    for (let i = 0; i < 10; i++) {
      await adapter.appendSignal(makeSignal())
    }
    const limited = await adapter.getSignals({ userId: 'user-1' }, 3)
    expect(limited).toHaveLength(3)
  })

  it('updates signal status', async () => {
    const signal = makeSignal({ aiStatus: 'pending' })
    await adapter.appendSignal(signal)
    await adapter.updateSignalStatus(signal.id, 'approved')

    const result = await adapter.getSignals({ userId: 'user-1' })
    expect(result[0]?.aiStatus).toBe('approved')
  })

  it('fires subscription callback on new signal matching scope', async () => {
    const received: Array<Signal> = []
    const unsub = adapter.subscribeSignals(
      { userId: 'user-1', market: 'okx' },
      (s) => received.push(s),
    )

    await adapter.appendSignal(makeSignal({ market: 'okx' }))
    await adapter.appendSignal(makeSignal({ market: 'binance' }))

    expect(received).toHaveLength(1)
    expect(received[0]?.market).toBe('okx')

    unsub()
  })

  it('unsubscribing from signals stops callbacks', async () => {
    const received: Array<Signal> = []
    const unsub = adapter.subscribeSignals({ userId: 'user-1' }, (s) =>
      received.push(s),
    )

    await adapter.appendSignal(makeSignal())
    unsub()
    await adapter.appendSignal(makeSignal())

    expect(received).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Workspace and Chart State
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — workspace and chart state', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('returns null for unknown workspace', async () => {
    const result = await adapter.getWorkspace('user-1', 'ws-1')
    expect(result).toBeNull()
  })

  it('persists and retrieves a workspace layout', async () => {
    const layout: WorkspaceLayout = {
      id: 'ws-1',
      name: 'My Layout',
      panels: { left: 'chart', right: 'orderbook' },
      createdAt: 1000,
      updatedAt: 2000,
    }
    await adapter.setWorkspace('user-1', 'ws-1', layout)
    const result = await adapter.getWorkspace('user-1', 'ws-1')
    expect(result?.name).toBe('My Layout')
    expect(result?.panels).toEqual({ left: 'chart', right: 'orderbook' })
  })

  it('isolates workspaces by userId', async () => {
    const layout: WorkspaceLayout = {
      id: 'ws-1',
      name: 'User 1 Layout',
      panels: {},
      createdAt: 1000,
      updatedAt: 2000,
    }
    await adapter.setWorkspace('user-1', 'ws-1', layout)
    const result = await adapter.getWorkspace('user-2', 'ws-1')
    expect(result).toBeNull()
  })

  it('returns null for unknown chart state', async () => {
    const result = await adapter.getChartState('user-1', 'BTC-USDT')
    expect(result).toBeNull()
  })

  it('persists and retrieves chart state', async () => {
    const state: ChartState = {
      pairKey: 'BTC-USDT',
      indicators: [{ type: 'rsi', period: 14 }],
      drawings: [],
      settings: { theme: 'dark' },
    }
    await adapter.setChartState('user-1', 'BTC-USDT', state)
    const result = await adapter.getChartState('user-1', 'BTC-USDT')
    expect(result?.pairKey).toBe('BTC-USDT')
    expect(result?.indicators).toHaveLength(1)
    expect(result?.settings).toEqual({ theme: 'dark' })
  })

  it('isolates chart state by pairKey', async () => {
    const btcState: ChartState = {
      pairKey: 'BTC-USDT',
      indicators: [{ type: 'macd' }],
      drawings: [],
      settings: {},
    }
    const ethState: ChartState = {
      pairKey: 'ETH-USDT',
      indicators: [{ type: 'bollinger' }],
      drawings: [],
      settings: {},
    }
    await adapter.setChartState('user-1', 'BTC-USDT', btcState)
    await adapter.setChartState('user-1', 'ETH-USDT', ethState)

    const btc = await adapter.getChartState('user-1', 'BTC-USDT')
    const eth = await adapter.getChartState('user-1', 'ETH-USDT')
    expect(btc?.indicators[0]).toEqual({ type: 'macd' })
    expect(eth?.indicators[0]).toEqual({ type: 'bollinger' })
  })
})

// ---------------------------------------------------------------------------
// Trade Journal
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — trade journal', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  function makeEntry(
    overrides?: Partial<TradeJournalEntry>,
  ): TradeJournalEntry {
    return {
      id: crypto.randomUUID(),
      userId: 'user-1',
      market: 'okx',
      pairKey: 'BTC-USDT',
      side: 'buy',
      price: 50000,
      quantity: 0.1,
      notes: '',
      tags: [],
      createdAt: Date.now(),
      ...overrides,
    }
  }

  it('returns empty array when no entries exist', async () => {
    const entries = await adapter.getTradeEntries({ userId: 'user-1' })
    expect(entries).toEqual([])
  })

  it('appends and retrieves a trade entry', async () => {
    const entry = makeEntry({ notes: 'test trade' })
    await adapter.appendTradeEntry(entry)
    const result = await adapter.getTradeEntries({ userId: 'user-1' })
    expect(result).toHaveLength(1)
    expect(result[0]?.notes).toBe('test trade')
  })

  it('filters by market', async () => {
    await adapter.appendTradeEntry(makeEntry({ market: 'okx' }))
    await adapter.appendTradeEntry(makeEntry({ market: 'binance' }))

    const okx = await adapter.getTradeEntries({
      userId: 'user-1',
      market: 'okx',
    })
    expect(okx).toHaveLength(1)
    expect(okx[0]?.market).toBe('okx')
  })

  it('filters by pairKey', async () => {
    await adapter.appendTradeEntry(makeEntry({ pairKey: 'BTC-USDT' }))
    await adapter.appendTradeEntry(makeEntry({ pairKey: 'ETH-USDT' }))

    const eth = await adapter.getTradeEntries({
      userId: 'user-1',
      pairKey: 'ETH-USDT',
    })
    expect(eth).toHaveLength(1)
    expect(eth[0]?.pairKey).toBe('ETH-USDT')
  })

  it('filters by date range', async () => {
    const now = 1_000_000

    await adapter.appendTradeEntry(makeEntry({ createdAt: now - 1000 }))
    await adapter.appendTradeEntry(makeEntry({ createdAt: now }))
    await adapter.appendTradeEntry(makeEntry({ createdAt: now + 1000 }))

    const result = await adapter.getTradeEntries({
      userId: 'user-1',
      startDate: now - 500,
      endDate: now + 500,
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.createdAt).toBe(now)
  })

  it('isolates entries by userId', async () => {
    await adapter.appendTradeEntry(makeEntry({ userId: 'user-1' }))
    await adapter.appendTradeEntry(makeEntry({ userId: 'user-2' }))

    const u1 = await adapter.getTradeEntries({ userId: 'user-1' })
    const u2 = await adapter.getTradeEntries({ userId: 'user-2' })

    expect(u1).toHaveLength(1)
    expect(u2).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// User Config Subscriptions
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — user config subscriptions', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('fires callback when user config updates', async () => {
    const received: Array<UserConfig> = []
    const unsub = adapter.subscribeUserConfig('user-1', (c) => received.push(c))

    await adapter.updateUserConfig('user-1', { aiPersona: 'technical' })

    expect(received).toHaveLength(1)
    expect(received[0]?.aiPersona).toBe('technical')

    unsub()
  })

  it('does not fire for different userId', async () => {
    const received: Array<UserConfig> = []
    adapter.subscribeUserConfig('user-2', (c) => received.push(c))

    await adapter.updateUserConfig('user-1', { aiPersona: 'mentor' })

    expect(received).toHaveLength(0)
  })

  it('supports multiple independent subscriptions', async () => {
    const receivedA: Array<UserConfig> = []
    const receivedB: Array<UserConfig> = []

    const unsubA = adapter.subscribeUserConfig('user-1', (c) =>
      receivedA.push(c),
    )
    const unsubB = adapter.subscribeUserConfig('user-1', (c) =>
      receivedB.push(c),
    )

    await adapter.updateUserConfig('user-1', { tradingMode: 'live' })

    expect(receivedA).toHaveLength(1)
    expect(receivedB).toHaveLength(1)

    unsubA()
    unsubB()
  })
})

// ---------------------------------------------------------------------------
// Plugin Config
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — plugin config', () => {
  let adapter: LocalPersistenceAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('returns null for unknown plugin config', async () => {
    const result = await adapter.getPluginConfig('user-1', 'my-plugin')
    expect(result).toBeNull()
  })

  it('persists and retrieves plugin config', async () => {
    const config = {
      pluginId: 'my-plugin',
      encryptedData: 'abc123',
      iv: 'iv-value',
      tag: 'tag-value',
      algorithm: 'aes-256-gcm',
      version: 1,
    }
    await adapter.setPluginConfig('user-1', 'my-plugin', config)
    const result = await adapter.getPluginConfig('user-1', 'my-plugin')
    expect(result?.encryptedData).toBe('abc123')
    expect(result?.version).toBe(1)
  })

  it('isolates plugin config by userId', async () => {
    const config = {
      pluginId: 'my-plugin',
      encryptedData: 'secret',
      iv: 'iv',
      tag: 'tag',
      algorithm: 'aes-256-gcm',
      version: 1,
    }
    await adapter.setPluginConfig('user-1', 'my-plugin', config)
    const result = await adapter.getPluginConfig('user-2', 'my-plugin')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Cross-window bridge (BroadcastChannel)
// ---------------------------------------------------------------------------

describe('LocalPersistenceAdapter — cross-window bridge', () => {
  // Two adapter instances in one process behave exactly like two windows:
  // BroadcastChannel delivers to every channel with the same name except
  // the poster.
  it('propagates watchlist writes to sibling adapter instances', async () => {
    const writer = makeAdapter()
    const receiver = makeAdapter()

    const updates: Array<WatchlistsState> = []
    receiver.subscribeWatchlists('user-1', (state) => updates.push(state))

    const state: WatchlistsState = {
      activeListId: 'favorites',
      lists: [{ id: 'favorites', name: 'Favorites', symbols: ['BTC-USDT'] }],
    }
    await writer.setWatchlists('user-1', state)
    // BroadcastChannel delivery is asynchronous
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(updates).toHaveLength(1)
    expect(updates[0].lists[0].symbols).toEqual(['BTC-USDT'])
    // The receiver's read path must see the fresh value, not a stale
    // in-memory copy
    expect(await receiver.getWatchlists('user-1')).toEqual(state)
  })

  it('does not broadcast encrypted plugin configs', async () => {
    const writer = makeAdapter()
    const receiver = makeAdapter()

    const config = {
      pluginId: 'my-plugin',
      encryptedData: 'secret',
      iv: 'iv',
      tag: 'tag',
      algorithm: 'aes-256-gcm',
      version: 1,
    }
    await writer.setPluginConfig('user-1', 'my-plugin', config)
    await new Promise((resolve) => setTimeout(resolve, 25))

    // Without localStorage in the test env, a received broadcast would be
    // the only way this value could appear in the sibling instance
    expect(await receiver.getPluginConfig('user-1', 'my-plugin')).toBeNull()
  })

  it('announces signals appended in a sibling window exactly once', async () => {
    const writer = makeAdapter()
    const receiver = makeAdapter()

    const received: Array<Signal> = []
    receiver.subscribeSignals({ userId: 'user-1' }, (signal) =>
      received.push(signal),
    )

    const signal = makeSignal()
    await writer.appendSignal(signal)
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(received).toHaveLength(1)
    expect(received[0].id).toBe(signal.id)

    // A status update rewrites the array without appending — no re-announce
    await writer.updateSignalStatus(signal.id, 'approved')
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(received).toHaveLength(1)
  })
})
