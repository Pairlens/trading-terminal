// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the Cloud Sync switches actually enforce.
 *
 * The interesting cases are the quiet ones: a debounced flush escaping a
 * moment after the switch went off, and — the one that loses work — a value
 * edited while a domain was off carrying a stale local clock, so the server's
 * older copy wins the merge when it comes back on.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

// Full localStorage backing, installed before the modules under test read it —
// and installed unconditionally, because a sibling test file may have left a
// partial shim behind. The original is restored in afterAll.
const backing = new Map<string, string>()
const previousStorage = globalThis.localStorage as Storage | undefined
globalThis.localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => {
    backing.set(k, String(v))
  },
  removeItem: (k: string) => {
    backing.delete(k)
  },
  clear: () => backing.clear(),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size
  },
} as Storage

const { SyncCoordinator } = await import('../sync-coordinator')
const { SYNC_DOMAIN_IDS } = await import('../sync-domains')
const { setCloudSyncEnabled, setDomainSyncEnabled } =
  await import('../sync-preferences')

const TIER1_DEBOUNCE_MS = 1500
const TIER2_DEBOUNCE_MS = 800

type Call = { url: string; method: string; body?: string }

let calls: Array<Call> = []
let remoteEntries: Record<string, { value: unknown; updatedAt: number }> = {}

const realFetch = globalThis.fetch

function installFetchStub() {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    const payload =
      method === 'GET' && url.includes('/api/sync/preferences')
        ? { entries: remoteEntries }
        : { entries: {} }
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof fetch
}

function puts(pathFragment: string): Array<Call> {
  return calls.filter((c) => c.method === 'PUT' && c.url.includes(pathFragment))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let coordinator: InstanceType<typeof SyncCoordinator>

beforeEach(async () => {
  backing.clear()
  calls = []
  remoteEntries = {}
  installFetchStub()
  // Every domain on: the shipped default, and the state each test departs from.
  setCloudSyncEnabled(true)
  for (const id of SYNC_DOMAIN_IDS) setDomainSyncEnabled(id, true)
  coordinator = new SyncCoordinator('https://server.test', async () => 'token')
  await coordinator.setSession('user-1')
  calls = []
})

afterEach(() => {
  coordinator.destroy()
})

afterAll(() => {
  globalThis.fetch = realFetch
  if (previousStorage) globalThis.localStorage = previousStorage
})

describe('push gating', () => {
  test('a disabled domain sends nothing but still stamps the local clock', async () => {
    setDomainSyncEnabled('preferences', false)

    coordinator.markDirty('language', 'es')
    await wait(TIER1_DEBOUNCE_MS + 300)

    expect(puts('/api/sync/preferences')).toEqual([])
    // The stamp is what makes this edit win the merge on re-enable — without
    // it the server's older copy would silently overwrite it.
    const stamp = localStorage.getItem('pairlens:sync-ts:language')
    expect(stamp).not.toBeNull()
    expect(Number(stamp)).toBeGreaterThan(0)
  })

  test('other domains keep syncing while one is off', async () => {
    setDomainSyncEnabled('preferences', false)

    coordinator.markDirty('language', 'es')
    coordinator.markDirty('workflows', [{ id: 'w1', updatedAt: 2 }])
    await wait(TIER2_DEBOUNCE_MS + 300)

    expect(puts('/api/sync/preferences')).toEqual([])
    expect(puts('/api/workflows/bulk')).toHaveLength(1)
  })

  test('the master switch stops every domain', async () => {
    setCloudSyncEnabled(false)

    coordinator.markDirty('language', 'es')
    coordinator.markDirty('workflows', [{ id: 'w1', updatedAt: 2 }])
    await wait(TIER1_DEBOUNCE_MS + 300)

    expect(calls.filter((c) => c.method === 'PUT')).toEqual([])
  })

  test('switching off mid-debounce cancels the pending flush', async () => {
    coordinator.markDirty('language', 'es')
    coordinator.markDirty('custom-workspaces', [{ id: 'a' }])
    // Both flushes are still queued at this point.
    setDomainSyncEnabled('preferences', false)
    setDomainSyncEnabled('workspaces', false)
    await wait(TIER1_DEBOUNCE_MS + 300)

    expect(calls.filter((c) => c.method === 'PUT')).toEqual([])
  })
})

describe('hydrate gating', () => {
  test('a disabled domain does not take values back from the server', async () => {
    remoteEntries = {
      'terminal.chartType': { value: 'line', updatedAt: Date.now() + 60_000 },
    }
    setDomainSyncEnabled('charts', false)

    await coordinator.setSession('user-1')

    expect(localStorage.getItem('pairlens:terminal.chartType')).toBeNull()
  })

  test('an enabled domain still hydrates', async () => {
    remoteEntries = {
      'terminal.chartType': { value: 'line', updatedAt: Date.now() + 60_000 },
    }

    await coordinator.setSession('user-1')

    expect(localStorage.getItem('pairlens:terminal.chartType')).toBe('"line"')
  })

  test('the server cannot write a key the blocklist protects', async () => {
    // The exact shape a hostile or compromised App Server would answer with.
    // A pinned publisher key is the trust anchor behind the plugin-signature
    // gate, and the lock config is what stands between a stolen laptop and an
    // unlocked terminal — neither may ever arrive over the wire.
    const soon = Date.now() + 60_000
    remoteEntries = {
      'custom-publisher-keys': {
        value: [{ id: 'evil', publicKey: 'AAAA', addedAt: '2026-01-01' }],
        updatedAt: soon,
      },
      'security.lock': {
        value: { version: 1, enabled: false },
        updatedAt: soon,
      },
      'keychain:binance': { value: 'secret', updatedAt: soon },
      'cloud-sync': { value: { enabled: true, domains: {} }, updatedAt: soon },
    }

    await coordinator.setSession('user-1')

    expect(localStorage.getItem('pairlens:custom-publisher-keys')).toBeNull()
    expect(localStorage.getItem('pairlens:security.lock')).toBeNull()
    expect(localStorage.getItem('pairlens:keychain:binance')).toBeNull()
  })

  test('a key this endpoint never carries is not written back either', async () => {
    // Not blocklisted, just not tier 1. Only tier-1 keys are ever PUT to
    // /api/sync/preferences, so anything else in the response is the server
    // inventing a slot rather than echoing one.
    const soon = Date.now() + 60_000
    remoteEntries = {
      'risk-config': { value: { maxDailyLoss: 0 }, updatedAt: soon },
      'custom-workspaces': { value: [], updatedAt: soon },
    }

    await coordinator.setSession('user-1')

    expect(localStorage.getItem('pairlens:risk-config')).toBeNull()
    expect(localStorage.getItem('pairlens:custom-workspaces')).toBeNull()
  })

  test('automation is not pulled while it is off', async () => {
    setDomainSyncEnabled('automation', false)
    calls = []

    await coordinator.setSession('user-1')

    expect(calls.filter((c) => c.url.includes('/api/workflows/bulk'))).toEqual(
      [],
    )
    expect(
      calls.filter((c) => c.url.includes('/api/notifications/sync')),
    ).toEqual([])
  })
})

describe('resume', () => {
  test('re-enabling pushes what this device has, including dynamic keys', async () => {
    setDomainSyncEnabled('workspaces', false)
    localStorage.setItem(
      'pairlens:custom-workspaces',
      JSON.stringify([{ id: 'a' }]),
    )
    localStorage.setItem(
      'pairlens:workspace.abc.layout',
      JSON.stringify({ panels: [] }),
    )
    calls = []

    setDomainSyncEnabled('workspaces', true)
    await wait(TIER2_DEBOUNCE_MS + 300)

    expect(puts('/api/user/workspace/custom-workspaces')).toHaveLength(1)
    expect(puts('/api/user/workspace/abc-layout')).toHaveLength(1)
  })

  test('re-enabling a tier-1 domain pulls first, then pushes the local value', async () => {
    setDomainSyncEnabled('preferences', false)
    localStorage.setItem('pairlens:language', JSON.stringify('es'))
    coordinator.markDirty('language', 'es')
    calls = []

    setDomainSyncEnabled('preferences', true)
    await wait(TIER1_DEBOUNCE_MS + 400)

    const gets = calls.filter(
      (c) => c.method === 'GET' && c.url.includes('/api/sync/preferences'),
    )
    expect(gets).toHaveLength(1)
    const pushes = puts('/api/sync/preferences')
    expect(pushes).toHaveLength(1)
    expect(pushes[0].body).toContain('"language"')
  })

  test('domains with no local store do no network work on resume', async () => {
    setDomainSyncEnabled('trades', false)
    calls = []

    setDomainSyncEnabled('trades', true)
    await wait(200)

    expect(calls).toEqual([])
  })

  test('re-enabling plugins re-uploads the local ledger', async () => {
    // Plugin state has no timestamp on either side, so the server row went
    // stale while the switch was off and the boot merge would apply it over
    // the ledger — re-enabling has to make this device the winner or the
    // connector the user disabled comes back on the next start.
    setDomainSyncEnabled('plugins', false)
    localStorage.setItem(
      'pairlens:plugin-ledger',
      JSON.stringify({
        binance: {
          pluginId: 'binance',
          source: 'bootstrap',
          enabled: false,
          config: { region: 'eu' },
          version: '1.0.0',
        },
        'removed-thing': {
          pluginId: 'removed-thing',
          source: 'bootstrap',
          enabled: false,
          config: {},
          version: '1.0.0',
          tombstoned: true,
        },
      }),
    )
    calls = []

    setDomainSyncEnabled('plugins', true)
    await wait(300)

    // Tombstoned entries stay out of it: boot skips them anyway, and pushing
    // them would write rows for plugins this device no longer has.
    const pushes = puts('/api/plugins/')
    expect(pushes).toHaveLength(1)
    expect(pushes[0].url).toContain('/api/plugins/binance')
    expect(JSON.parse(String(pushes[0].body))).toMatchObject({
      pluginId: 'binance',
      enabled: false,
      config: { region: 'eu' },
    })
  })

  test('flipping the master switch back on pulls preferences once', async () => {
    // Every domain resumes at the same moment; `preferences` and `charts`
    // share one GET and must not each fire their own.
    setCloudSyncEnabled(false)
    calls = []

    setCloudSyncEnabled(true)
    await wait(TIER1_DEBOUNCE_MS + 400)

    const gets = calls.filter(
      (c) => c.method === 'GET' && c.url.includes('/api/sync/preferences'),
    )
    expect(gets).toHaveLength(1)
  })
})

describe('master pause', () => {
  test('a fully paused device makes no round trip on login', async () => {
    setCloudSyncEnabled(false)
    calls = []

    await coordinator.setSession('user-1')

    expect(calls).toEqual([])
  })
})
