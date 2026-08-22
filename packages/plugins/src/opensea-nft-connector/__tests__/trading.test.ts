// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The refusal ladder, asserted where it is cheapest to get wrong.
 *
 * Two properties are worth a test here and everything else is detail.
 *
 * 1. EVERY REFUSAL HAPPENS BEFORE THE KEY IS READ. Each case hands the order
 *    path a key retriever that counts its calls, and asserts the count is zero.
 *    A refusal that has already opened the vault is a refusal that has given up
 *    the property it exists to protect.
 *
 * 2. THE SPEND IS DECIDED LOCALLY. The happy path stops at the moment of
 *    signing (the key retriever answers null) and asserts what WOULD have been
 *    sent: the target is the pinned Seaport, and the value is the sum of the
 *    listing's own signed consideration rather than the number OpenSea echoed
 *    back beside it.
 *
 * Nothing here touches the network. `request` is a stub over fixtures, and the
 * chain reads are a stubbed JSON-RPC endpoint so viem's real encoder and
 * decoder run rather than a mock of them.
 */
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { encodeFunctionResult } from 'viem'

import {
  DEFAULT_SEAPORT,
  ITEM_TYPE,
  NFT_ABI,
  OPENSEA_CONDUIT,
  OPENSEA_CONDUIT_KEY,
  SEAPORT_DEPLOYMENTS,
  considerationTotals,
  decimalToWei,
  operatorForConduitKey,
  planFulfillCall,
  resolveSeaport,
  toUint,
} from '../seaport'
import {
  MAX_FEE_BPS,
  MAX_SWEEP_ITEMS,
  checkListingOrder,
  encodedCovers,
  executeNftOrder,
  findOrderComponents,
  pickBestOffer,
  valueAgrees,
} from '../trading'
import type { NftOrderContext, NftOrderParams } from '../trading'

const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const OTHER_WALLET = '0x1111111111111111111111111111111111111111'
const DOODLES = '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e'
const OTHER_COLLECTION = '0x2222222222222222222222222222222222222222'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const OPENSEA_FEES = '0x0000a26b00c1F0DF003000390027140000fAa719'
const UNPINNED_SEAPORT = '0x00000000006c3852cbEf3e08E8dF289169EdE581'

const ONE_ETH = 1_000_000_000_000_000_000n
const ZONE = '0x000056F7000000EcE9003ca63978907a00FFD100'
const ZERO_HASH = `0x${'0'.repeat(64)}`

// ── Fixtures, shaped like the live payloads ────────────────────────────

/** A fixed-price ETH listing of one Doodle, priced at `total` wei. */
function listingFixture(
  overrides: {
    total?: bigint
    token?: string
    tokenId?: string
    protocolAddress?: string
    chain?: string
    declining?: boolean
    erc20?: boolean
  } = {},
) {
  const total = overrides.total ?? ONE_ETH
  const fee = total / 40n
  const toSeller = total - fee
  return {
    order_hash: '0xdeadbeef',
    chain: overrides.chain ?? 'ethereum',
    protocol_address: overrides.protocolAddress ?? DEFAULT_SEAPORT.address,
    protocol_data: {
      parameters: {
        offerer: OTHER_WALLET,
        offer: [
          {
            itemType: ITEM_TYPE.ERC721,
            token: overrides.token ?? DOODLES,
            identifierOrCriteria: overrides.tokenId ?? '42',
            startAmount: '1',
            endAmount: '1',
          },
        ],
        consideration: [
          {
            itemType: overrides.erc20 ? ITEM_TYPE.ERC20 : ITEM_TYPE.NATIVE,
            token: overrides.erc20
              ? WETH
              : '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: toSeller.toString(),
            endAmount: overrides.declining
              ? (toSeller / 2n).toString()
              : toSeller.toString(),
            recipient: OTHER_WALLET,
          },
          {
            itemType: ITEM_TYPE.NATIVE,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: fee.toString(),
            endAmount: fee.toString(),
            recipient: OPENSEA_FEES,
          },
        ],
        orderType: 2,
        zone: ZONE,
        zoneHash: ZERO_HASH,
        salt: '0x01',
        conduitKey: OPENSEA_CONDUIT_KEY,
        totalOriginalConsiderationItems: 2,
        counter: '0',
      },
      signature: '0xabcd',
    },
  }
}

/**
 * A fulfilment response in the shape OpenSea returns: `function` as a signature
 * string, `input_data` keyed by Solidity parameter name.
 */
function fulfilmentFixture(
  value: bigint,
  overrides: { to?: string; fn?: string } = {},
) {
  return {
    protocol: 'seaport1.6',
    fulfillment_data: {
      transaction: {
        function:
          overrides.fn ??
          'fulfillBasicOrder_efficient_6GL6yc((address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,(uint256,address)[],bytes))',
        chain: 1,
        to: overrides.to ?? DEFAULT_SEAPORT.address,
        value: value.toString(),
        input_data: {
          parameters: {
            considerationToken: '0x0000000000000000000000000000000000000000',
            considerationIdentifier: '0',
            considerationAmount: (value - value / 40n).toString(),
            offerer: OTHER_WALLET,
            zone: ZONE,
            offerToken: DOODLES,
            offerIdentifier: '42',
            offerAmount: '1',
            basicOrderType: 2,
            startTime: '0',
            endTime: '99999999999',
            zoneHash: ZERO_HASH,
            salt: '1',
            offererConduitKey: OPENSEA_CONDUIT_KEY,
            fulfillerConduitKey: `0x${'0'.repeat(64)}`,
            totalOriginalAdditionalRecipients: '1',
            additionalRecipients: [
              { amount: (value / 40n).toString(), recipient: OPENSEA_FEES },
            ],
            signature: '0xabcd',
          },
        },
      },
    },
  }
}

// ── Contexts ───────────────────────────────────────────────────────────

type RequestStub = (
  path: string,
  init?: { method?: string; body?: unknown },
) => unknown

function makeContext(
  routes: RequestStub,
  overrides: Partial<NftOrderContext> = {},
): { ctx: NftOrderContext; keyReads: () => number } {
  let keyReads = 0
  const ctx: NftOrderContext = {
    apiKey: 'test-key',
    chain: 'ethereum',
    slug: 'doodles-official',
    contract: DOODLES,
    slot: {
      walletId: 'wallet-1',
      address: WALLET,
      getPrivateKey: async () => {
        keyReads += 1
        return null
      },
    },
    request: (async (
      path: string,
      init?: { method?: string; body?: unknown },
    ) => routes(path, init)) as NftOrderContext['request'],
    ...overrides,
  }
  return { ctx, keyReads: () => keyReads }
}

const BUY_MARKET: NftOrderParams = {
  action: 'place',
  side: 'buy',
  type: 'market',
  size: 1,
}

// ── The stubbed chain ──────────────────────────────────────────────────

type RpcHandler = (method: string, params: Array<unknown>) => unknown

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubRpc(handler: RpcHandler) {
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      id: number
      method: string
      params?: Array<unknown>
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: handler(body.method, body.params ?? []),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

/** `getConduit(OPENSEA_CONDUIT_KEY)` answering with the pinned conduit. */
const GOOD_CONDUIT = encodeFunctionResult({
  abi: [
    {
      type: 'function',
      name: 'getConduit',
      stateMutability: 'view',
      inputs: [{ name: 'conduitKey', type: 'bytes32' }],
      outputs: [
        { name: 'conduit', type: 'address' },
        { name: 'exists', type: 'bool' },
      ],
    },
  ] as const,
  functionName: 'getConduit',
  result: [OPENSEA_CONDUIT, true],
})

function ownerOfResult(address: string) {
  return encodeFunctionResult({
    abi: NFT_ABI,
    functionName: 'ownerOf',
    result: address as `0x${string}`,
  })
}

// ── 1. Pinned constants ────────────────────────────────────────────────

describe('the pinned Seaport allowlist', () => {
  it('resolves 1.6 and 1.5 case-insensitively and refuses everything else', () => {
    expect(resolveSeaport(DEFAULT_SEAPORT.address)?.version).toBe('1.6')
    expect(resolveSeaport(DEFAULT_SEAPORT.address.toLowerCase())?.version).toBe(
      '1.6',
    )
    expect(
      resolveSeaport('0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC')?.version,
    ).toBe('1.5')
    // Seaport 1.1 is a real deployment and is deliberately NOT pinned.
    expect(resolveSeaport(UNPINNED_SEAPORT)).toBeNull()
    expect(resolveSeaport('0xnot-an-address')).toBeNull()
    expect(resolveSeaport(undefined)).toBeNull()
    expect(Object.keys(SEAPORT_DEPLOYMENTS)).toHaveLength(2)
  })

  it('maps only two conduit keys to an operator', () => {
    expect(operatorForConduitKey(OPENSEA_CONDUIT_KEY, DEFAULT_SEAPORT)).toBe(
      OPENSEA_CONDUIT,
    )
    expect(operatorForConduitKey(ZERO_HASH, DEFAULT_SEAPORT)).toBe(
      DEFAULT_SEAPORT.address,
    )
    expect(
      operatorForConduitKey(`0x${'ab'.repeat(32)}`, DEFAULT_SEAPORT),
    ).toBeNull()
  })
})

// ── 2. Pure helpers that decide money ──────────────────────────────────

describe('toUint refuses what it cannot read exactly', () => {
  it('keeps precision that a JSON number would lose', () => {
    expect(toUint('1000000000000000000')).toBe(ONE_ETH)
    expect(toUint(1_000)).toBe(1_000n)
    // 0.1 ETH in wei is far past MAX_SAFE_INTEGER, so a parsed float is refused
    // rather than rounded into a spend.
    expect(toUint(1e17)).toBeNull()
    expect(toUint(-1)).toBeNull()
    expect(toUint(1.5)).toBeNull()
    expect(toUint('12abc')).toBeNull()
    expect(toUint(null)).toBeNull()
  })
})

describe('decimalToWei never goes through exponent notation', () => {
  it('converts small and large prices alike', () => {
    expect(decimalToWei(1)).toBe(ONE_ETH)
    expect(decimalToWei(0.0000001)).toBe(100_000_000_000n)
    expect(decimalToWei(1.5)).toBe(1_500_000_000_000_000_000n)
    expect(decimalToWei(0)).toBeNull()
    expect(decimalToWei(-1)).toBeNull()
    expect(decimalToWei(Number.NaN)).toBeNull()
  })
})

describe('considerationTotals sums only native items', () => {
  it('reports the total, the token leg and the declining leg', () => {
    const fixed = considerationTotals(
      listingFixture().protocol_data.parameters.consideration,
    )
    expect(fixed?.native).toBe(ONE_ETH)
    expect(fixed?.hasNonNative).toBe(false)
    expect(fixed?.isDeclining).toBe(false)

    const declining = considerationTotals(
      listingFixture({ declining: true }).protocol_data.parameters
        .consideration,
    )
    expect(declining?.isDeclining).toBe(true)

    const erc20 = considerationTotals(
      listingFixture({ erc20: true }).protocol_data.parameters.consideration,
    )
    expect(erc20?.hasNonNative).toBe(true)
  })
})

describe('valueAgrees is a cross-check, never the source', () => {
  it('demands exact agreement when the echo can be read exactly', () => {
    expect(valueAgrees('1000000000000000000', ONE_ETH)).toBe(true)
    expect(valueAgrees('1000000000000000001', ONE_ETH)).toBe(false)
    expect(valueAgrees(undefined, ONE_ETH)).toBe(true)
    // A lossy JSON number is compared as a float, which still catches an echo
    // asking for a different order of magnitude.
    expect(valueAgrees(1e18, ONE_ETH)).toBe(true)
    expect(valueAgrees(1e19, ONE_ETH)).toBe(false)
  })
})

describe('planFulfillCall pins the function and forces the recipient', () => {
  it('refuses a function outside the allowlist', () => {
    const planned = planFulfillCall({
      functionSignature: 'transferOwnership(address)',
      inputData: { newOwner: WALLET },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
    })
    expect('error' in planned && planned.error).toContain('unrecognised')
  })

  it('refuses a conduit key it cannot map to an operator', () => {
    const planned = planFulfillCall({
      functionSignature: 'fulfillOrder((..),bytes32)',
      inputData: { order: {}, fulfillerConduitKey: `0x${'ab'.repeat(32)}` },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
    })
    expect('error' in planned && planned.error).toContain('conduit')
  })

  it('overwrites a recipient the response tried to steer', () => {
    const planned = planFulfillCall({
      functionSignature: 'fulfillAdvancedOrder((..),(..)[],bytes32,address)',
      inputData: {
        advancedOrder: {},
        criteriaResolvers: [],
        fulfillerConduitKey: ZERO_HASH,
        recipient: OTHER_WALLET,
      },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
    })
    expect('error' in planned).toBe(false)
    if ('plan' in planned) {
      expect(planned.plan.args[3]).toBe(WALLET)
      expect(planned.operator).toBe(DEFAULT_SEAPORT.address)
    }
  })

  it('orders arguments by name, not by object key order', () => {
    const planned = planFulfillCall({
      functionSignature: 'fulfillOrder((..),bytes32)',
      // Deliberately reversed: a positional read would encode these backwards.
      inputData: { fulfillerConduitKey: ZERO_HASH, order: { marker: true } },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
    })
    expect('plan' in planned).toBe(true)
    if ('plan' in planned) {
      expect(planned.plan.args[0]).toEqual({ marker: true })
      expect(planned.plan.args[1]).toBe(ZERO_HASH)
    }
  })
})

// ── 3. The order path's early refusals ─────────────────────────────────

describe('executeNftOrder refuses before it fetches anything', () => {
  const noRoutes: RequestStub = (path) => {
    throw new Error(`unexpected request to ${path}`)
  }

  it('refuses Solana by name', async () => {
    const { ctx, keyReads } = makeContext(noRoutes, { chain: 'solana' })
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Seaport')
    expect(keyReads()).toBe(0)
  })

  it('refuses a chain outside TRADABLE_CHAINS', async () => {
    const { ctx, keyReads } = makeContext(noRoutes, { chain: 'polygon' })
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not sign orders on polygon')
    expect(keyReads()).toBe(0)
  })

  it('refuses a fractional or oversized size', async () => {
    const { ctx, keyReads } = makeContext(noRoutes)
    expect(
      (await executeNftOrder(ctx, { ...BUY_MARKET, size: 1.5 })).error,
    ).toContain('whole number')
    expect(
      (await executeNftOrder(ctx, { ...BUY_MARKET, size: 0 })).error,
    ).toContain('whole number')
    expect(
      (await executeNftOrder(ctx, { ...BUY_MARKET, size: MAX_SWEEP_ITEMS + 1 }))
        .error,
    ).toContain(String(MAX_SWEEP_ITEMS))
    expect(keyReads()).toBe(0)
  })

  it('refuses a wallet slot with no key accessor', async () => {
    const { ctx } = makeContext(noRoutes, {
      slot: { walletId: 'w', address: WALLET, getPrivateKey: null },
    })
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No wallet is connected')
  })

  it('refuses a limit order with no price, and a sell with no token id', async () => {
    const { ctx, keyReads } = makeContext(noRoutes)
    expect(
      (await executeNftOrder(ctx, { ...BUY_MARKET, type: 'limit' })).error,
    ).toContain('needs a price')
    expect(
      (
        await executeNftOrder(ctx, {
          ...BUY_MARKET,
          side: 'sell',
          type: 'limit',
          price: 1,
        })
      ).error,
    ).toContain('token id')
    expect(keyReads()).toBe(0)
  })
})

// ── 4. The sweep's refusals, all before the key ────────────────────────

describe('the sweep refuses a listing that is not the one it asked for', () => {
  function sweepContext(listing: unknown) {
    return makeContext((path) => {
      if (path.startsWith('/listings/collection/'))
        return { listings: [listing] }
      throw new Error(`unexpected request to ${path}`)
    })
  }

  it('refuses an unpinned protocol contract', async () => {
    const { ctx, keyReads } = sweepContext(
      listingFixture({ protocolAddress: UNPINNED_SEAPORT }),
    )
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.success).toBe(false)
    expect(result.error).toContain('unpinned protocol contract')
    expect(keyReads()).toBe(0)
  })

  it('refuses a listing for another collection', async () => {
    const { ctx, keyReads } = sweepContext(
      listingFixture({ token: OTHER_COLLECTION }),
    )
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.error).toContain(OTHER_COLLECTION)
    expect(keyReads()).toBe(0)
  })

  it('refuses a listing echoed back on another chain', async () => {
    const { ctx, keyReads } = sweepContext(listingFixture({ chain: 'base' }))
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.error).toContain('the listing is on base')
    expect(keyReads()).toBe(0)
  })

  it('refuses a listing that costs more than the price authorised', async () => {
    const { ctx, keyReads } = sweepContext(
      listingFixture({ total: 2n * ONE_ETH }),
    )
    const result = await executeNftOrder(ctx, { ...BUY_MARKET, price: 1 })
    expect(result.error).toContain('more than the price you set')
    expect(keyReads()).toBe(0)
  })

  it('refuses a token-denominated listing and a declining one', async () => {
    const erc20 = sweepContext(listingFixture({ erc20: true }))
    expect((await executeNftOrder(erc20.ctx, BUY_MARKET)).error).toContain(
      'priced in a token',
    )
    expect(erc20.keyReads()).toBe(0)

    const dutch = sweepContext(listingFixture({ declining: true }))
    expect((await executeNftOrder(dutch.ctx, BUY_MARKET)).error).toContain(
      'declining-price',
    )
    expect(dutch.keyReads()).toBe(0)
  })

  it('refuses a token id it did not ask for', async () => {
    const { ctx, keyReads } = sweepContext(listingFixture({ tokenId: '7' }))
    const result = await executeNftOrder(ctx, { ...BUY_MARKET, tokenId: '42' })
    expect(result.error).toContain('token #7')
    expect(keyReads()).toBe(0)
  })
})

describe('the sweep refuses a fulfilment that is not the listing', () => {
  function fulfilContext(fulfilment: unknown) {
    return makeContext((path) => {
      if (path.startsWith('/listings/collection/')) {
        return { listings: [listingFixture()] }
      }
      if (path === '/listings/fulfillment_data') return fulfilment
      throw new Error(`unexpected request to ${path}`)
    })
  }

  it('refuses a target that is not the pinned Seaport', async () => {
    stubRpc(() => GOOD_CONDUIT)
    const { ctx, keyReads } = fulfilContext(
      fulfilmentFixture(ONE_ETH, { to: UNPINNED_SEAPORT }),
    )
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.error).toContain('rather than the pinned Seaport')
    expect(keyReads()).toBe(0)
  })

  it('refuses a value that disagrees with the listing itself', async () => {
    stubRpc(() => GOOD_CONDUIT)
    const { ctx, keyReads } = fulfilContext(fulfilmentFixture(3n * ONE_ETH))
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.error).toContain('a different amount')
    expect(keyReads()).toBe(0)
  })

  it('refuses a function outside the Seaport allowlist', async () => {
    stubRpc(() => GOOD_CONDUIT)
    const { ctx, keyReads } = fulfilContext(
      fulfilmentFixture(ONE_ETH, { fn: 'sweepTokens(address)' }),
    )
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.error).toContain('unrecognised Seaport function')
    expect(keyReads()).toBe(0)
  })
})

describe('the sweep stops at the signature, with the value it computed itself', () => {
  it('reads the key last and derives value from the order, not the echo', async () => {
    stubRpc(() => GOOD_CONDUIT)
    // The echo is deliberately a lossy JSON number, the way OpenSea serialises
    // it. The transaction below is built from the consideration sum regardless.
    const fulfilment = fulfilmentFixture(ONE_ETH)
    fulfilment.fulfillment_data.transaction.value = 1e18 as unknown as string

    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/listings/collection/')) {
        return { listings: [listingFixture()] }
      }
      if (path === '/listings/fulfillment_data') return fulfilment
      throw new Error(`unexpected request to ${path}`)
    })

    const result = await executeNftOrder(ctx, BUY_MARKET)
    // The key retriever answers null, so this is exactly where signing would
    // have begun: every gate passed, nothing was sent.
    expect(result.success).toBe(false)
    expect(result.error).toBe('Wallet private key not found')
    expect(keyReads()).toBe(1)
  })

  it('refuses when the derived account is not the slot address', async () => {
    stubRpc(() => GOOD_CONDUIT)
    // A real key, deliberately not the one the slot claims.
    const strangerKey = `0x${'11'.repeat(32)}`
    const { ctx } = makeContext(
      (path) => {
        if (path.startsWith('/listings/collection/')) {
          return { listings: [listingFixture()] }
        }
        if (path === '/listings/fulfillment_data') {
          return fulfilmentFixture(ONE_ETH)
        }
        throw new Error(`unexpected request to ${path}`)
      },
      {
        slot: {
          walletId: 'w',
          address: WALLET,
          getPrivateKey: async () => strangerKey,
        },
      },
    )
    const result = await executeNftOrder(ctx, BUY_MARKET)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Private key does not match wallet')
  })
})

// ── 5. The listing path's order validation ─────────────────────────────

function listingMessage(overrides: Record<string, unknown> = {}) {
  const total = ONE_ETH
  const fee = total / 40n
  return {
    offerer: WALLET,
    zone: ZONE,
    offer: [
      {
        itemType: ITEM_TYPE.ERC721,
        token: DOODLES,
        identifierOrCriteria: '42',
        startAmount: '1',
        endAmount: '1',
      },
    ],
    consideration: [
      {
        itemType: ITEM_TYPE.NATIVE,
        token: '0x0000000000000000000000000000000000000000',
        identifierOrCriteria: '0',
        startAmount: (total - fee).toString(),
        endAmount: (total - fee).toString(),
        recipient: WALLET,
      },
      {
        itemType: ITEM_TYPE.NATIVE,
        token: '0x0000000000000000000000000000000000000000',
        identifierOrCriteria: '0',
        startAmount: fee.toString(),
        endAmount: fee.toString(),
        recipient: OPENSEA_FEES,
      },
    ],
    orderType: 2,
    startTime: String(Math.floor(Date.now() / 1000) - 10),
    endTime: String(Math.floor(Date.now() / 1000) + 86_400),
    zoneHash: ZERO_HASH,
    salt: '0x2a',
    conduitKey: OPENSEA_CONDUIT_KEY,
    counter: '0',
    ...overrides,
  }
}

describe('checkListingOrder rebuilds the order rather than trusting it', () => {
  const base = {
    run: {
      wallet: WALLET as `0x${string}`,
      contract: DOODLES as `0x${string}`,
      size: 1,
    },
    tokenId: 42n,
    total: ONE_ETH,
    counter: 0n,
    seaport: DEFAULT_SEAPORT,
  }

  it('accepts an order that matches, and pins the fields it rebuilt', () => {
    const checked = checkListingOrder({ ...base, message: listingMessage() })
    expect('components' in checked).toBe(true)
    if ('components' in checked) {
      expect(checked.components.offerer).toBe(WALLET)
      expect(checked.components.offer[0].token).toBe(DOODLES)
      expect(checked.components.offer[0].identifierOrCriteria).toBe(42n)
      expect(checked.components.counter).toBe(0n)
    }
  })

  it('refuses an order offered by somebody else', () => {
    const checked = checkListingOrder({
      ...base,
      message: listingMessage({ offerer: OTHER_WALLET }),
    })
    expect('error' in checked && checked.error).toContain('not your wallet')
  })

  it('refuses an order for the wrong collection or the wrong token', () => {
    const wrongToken = checkListingOrder({
      ...base,
      message: listingMessage({
        offer: [
          {
            itemType: ITEM_TYPE.ERC721,
            token: OTHER_COLLECTION,
            identifierOrCriteria: '42',
            startAmount: '1',
            endAmount: '1',
          },
        ],
      }),
    })
    expect('error' in wrongToken && wrongToken.error).toContain(
      OTHER_COLLECTION,
    )

    const wrongId = checkListingOrder({
      ...base,
      message: listingMessage({
        offer: [
          {
            itemType: ITEM_TYPE.ERC721,
            token: DOODLES,
            identifierOrCriteria: '7',
            startAmount: '1',
            endAmount: '1',
          },
        ],
      }),
    })
    expect('error' in wrongId && wrongId.error).toContain('#7')
  })

  it('refuses an order priced away from what was asked', () => {
    const halfPrice = checkListingOrder({
      ...base,
      message: listingMessage(),
      total: 2n * ONE_ETH,
    })
    expect('error' in halfPrice && halfPrice.error).toContain(
      'prices the item at',
    )
  })

  it('refuses an order that pays the seller nothing', () => {
    const checked = checkListingOrder({
      ...base,
      message: listingMessage({
        consideration: [
          {
            itemType: ITEM_TYPE.NATIVE,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: ONE_ETH.toString(),
            endAmount: ONE_ETH.toString(),
            recipient: OPENSEA_FEES,
          },
        ],
      }),
    })
    expect('error' in checked && checked.error).toContain(
      'pays the seller nothing',
    )
  })

  it('refuses a stale counter and an unknown conduit', () => {
    const staleCounter = checkListingOrder({
      ...base,
      message: listingMessage({ counter: '7' }),
    })
    expect('error' in staleCounter && staleCounter.error).toContain('counter 7')

    const strangeConduit = checkListingOrder({
      ...base,
      message: listingMessage({ conduitKey: `0x${'ab'.repeat(32)}` }),
    })
    expect('error' in strangeConduit && strangeConduit.error).toContain(
      'conduit',
    )
  })

  it('refuses an expired order', () => {
    const checked = checkListingOrder({
      ...base,
      message: listingMessage({
        startTime: '1',
        endTime: String(Math.floor(Date.now() / 1000) - 1),
      }),
    })
    expect('error' in checked && checked.error).toContain('expired')
  })
})

describe('findOrderComponents survives a proto3 envelope', () => {
  it('finds the order however deeply the steps nest it', () => {
    const found = findOrderComponents({
      steps: [
        { setApprovalAction: { chain: 'ethereum' } },
        {
          createListingsAction: {
            protocol_address: DEFAULT_SEAPORT.address,
            signature_request: { message: listingMessage() },
          },
        },
      ],
    })
    expect('message' in found).toBe(true)
    if ('message' in found) {
      expect(found.message['offerer']).toBe(WALLET)
      expect(found.protocolAddress).toBe(DEFAULT_SEAPORT.address)
    }
  })

  it('refuses a response with nothing order-shaped in it', () => {
    const found = findOrderComponents({ steps: [{ setApprovalAction: {} }] })
    expect('error' in found && found.error).toContain('no order to sign')
  })
})

describe('the listing path refuses a token the wallet does not hold', () => {
  it('reads ownerOf before the key, and stops there', async () => {
    stubRpc((method) => {
      if (method === 'eth_call') return ownerOfResult(OTHER_WALLET)
      if (method === 'eth_chainId') return '0x1'
      return '0x'
    })
    const { ctx, keyReads } = makeContext((path) => {
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'sell',
      type: 'limit',
      size: 1,
      price: 1,
      tokenId: '42',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not held by this wallet')
    expect(keyReads()).toBe(0)
  })
})

// ── 6. Accepting an offer ──────────────────────────────────────────────

function offerFixture(
  overrides: {
    proceeds?: bigint
    contract?: string
    encoded?: string | null
    traits?: unknown
    protocolAddress?: string
    status?: string
  } = {},
) {
  const proceeds = overrides.proceeds ?? ONE_ETH / 2n
  return {
    order_hash: '0xoffer',
    chain: 'ethereum',
    protocol_address: overrides.protocolAddress ?? DEFAULT_SEAPORT.address,
    protocol_data: {
      parameters: {
        offer: [
          {
            itemType: ITEM_TYPE.ERC20,
            token: WETH,
            identifierOrCriteria: '0',
            startAmount: proceeds.toString(),
            endAmount: proceeds.toString(),
          },
        ],
      },
    },
    remaining_quantity: 1,
    criteria: {
      collection: { slug: 'doodles-official' },
      contract: { address: overrides.contract ?? DOODLES },
      traits: overrides.traits ?? null,
      numeric_traits: null,
      encoded_token_ids:
        overrides.encoded === undefined ? '*' : overrides.encoded,
    },
    status: overrides.status ?? 'ACTIVE',
  }
}

describe('pickBestOffer takes the highest bid it can prove covers the token', () => {
  const run = { contract: DOODLES as `0x${string}`, chainSlug: 'ethereum' }

  it('prefers the larger of two valid offers', () => {
    const best = pickBestOffer(
      run,
      [offerFixture({ proceeds: 1n }), offerFixture({ proceeds: 9n })],
      42n,
    )
    expect('proceeds' in best && best.proceeds).toBe(9n)
  })

  it('skips a trait offer, another collection, an unpinned protocol and a dead status', () => {
    const skipped = pickBestOffer(
      run,
      [
        offerFixture({ traits: [{ type: 'hair', value: 'blue' }] }),
        offerFixture({ contract: OTHER_COLLECTION }),
        offerFixture({ protocolAddress: UNPINNED_SEAPORT }),
        offerFixture({ status: 'CANCELLED' }),
      ],
      42n,
    )
    expect('error' in skipped && skipped.error).toContain(
      'No standing collection offer',
    )
  })

  it('honours an explicit token id list', () => {
    expect(encodedCovers('1,5,9-12', 11n)).toBe(true)
    expect(encodedCovers('1,5,9-12', 13n)).toBe(false)
    const covered = pickBestOffer(
      run,
      [offerFixture({ encoded: '40-45' })],
      42n,
    )
    expect('proceeds' in covered).toBe(true)
    const missed = pickBestOffer(run, [offerFixture({ encoded: '1-5' })], 42n)
    expect('error' in missed).toBe(true)
  })
})

describe('accepting an offer refuses below the floor, before any chain read', () => {
  it('refuses a bid under the price the caller set as a floor', async () => {
    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/offers/collection/')) {
        return { offers: [offerFixture({ proceeds: ONE_ETH / 2n })] }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'sell',
      type: 'market',
      size: 1,
      price: 1,
      tokenId: '42',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('below the floor you set')
    expect(keyReads()).toBe(0)
  })

  it('refuses to sell more than one token in a single acceptance', async () => {
    const { ctx, keyReads } = makeContext((path) => {
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'sell',
      type: 'market',
      size: 2,
      tokenId: '42',
    })
    expect(result.error).toContain('one token at a time')
    expect(keyReads()).toBe(0)
  })
})

// ── 7. Fees ────────────────────────────────────────────────────────────

describe('the collection offer refuses an absurd fee schedule', () => {
  it('caps the total fee, and never reaches the key', async () => {
    stubRpc(() => GOOD_CONDUIT)
    const { ctx, keyReads } = makeContext((path) => {
      if (path === '/offers/build') {
        return {
          partialParameters: {
            consideration: [
              {
                itemType: ITEM_TYPE.ERC721_WITH_CRITERIA,
                token: DOODLES,
                identifierOrCriteria: '0',
                startAmount: '1',
                endAmount: '1',
                recipient: WALLET,
              },
            ],
            zone: ZONE,
            zoneHash: ZERO_HASH,
          },
        }
      }
      if (path.startsWith('/collections/')) {
        return { fees: [{ fee: 50, recipient: OPENSEA_FEES, required: true }] }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'buy',
      type: 'limit',
      size: 1,
      price: 1,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain(`${MAX_FEE_BPS} bps`)
    expect(keyReads()).toBe(0)
  })

  it('refuses an offer built against another collection', async () => {
    const { ctx, keyReads } = makeContext((path) => {
      if (path === '/offers/build') {
        return {
          partialParameters: {
            consideration: [
              {
                itemType: ITEM_TYPE.ERC721_WITH_CRITERIA,
                token: OTHER_COLLECTION,
                identifierOrCriteria: '0',
                startAmount: '1',
                endAmount: '1',
                recipient: WALLET,
              },
            ],
          },
        }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'buy',
      type: 'limit',
      size: 1,
      price: 1,
    })
    expect(result.error).toContain(OTHER_COLLECTION)
    expect(keyReads()).toBe(0)
  })
})
