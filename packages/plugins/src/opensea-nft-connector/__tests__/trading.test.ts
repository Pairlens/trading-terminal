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
  anchorCriteriaResolvers,
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
  offeredQuantity,
  pickBestOffer,
  sweepResult,
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

// A market buy carries the ceiling the ticket quoted. The fixtures list at
// 1 ETH, so 1 is the ceiling every one of them sits exactly on.
const BUY_MARKET: NftOrderParams = {
  action: 'place',
  side: 'buy',
  type: 'market',
  size: 1,
  price: 1,
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
      identifier: 42n,
    })
    expect('error' in planned && planned.error).toContain('unrecognised')
  })

  it('refuses a conduit key it cannot map to an operator', () => {
    const planned = planFulfillCall({
      functionSignature: 'fulfillOrder((..),bytes32)',
      inputData: { order: {}, fulfillerConduitKey: `0x${'ab'.repeat(32)}` },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
      identifier: 42n,
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
      identifier: 42n,
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
      identifier: 42n,
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
      (
        await executeNftOrder(ctx, {
          action: 'place',
          side: 'buy',
          type: 'limit',
          size: 1,
        })
      ).error,
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

  it('refuses a split that leaves the seller a token share of their own sale', () => {
    // The total is the 1 ETH that was asked for and the seller is paid
    // something, which is every check this order used to face. Almost all of it
    // still goes somewhere else.
    const checked = checkListingOrder({
      ...base,
      message: listingMessage({
        consideration: [
          {
            itemType: ITEM_TYPE.NATIVE,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: (ONE_ETH / 1000n).toString(),
            endAmount: (ONE_ETH / 1000n).toString(),
            recipient: WALLET,
          },
          {
            itemType: ITEM_TYPE.NATIVE,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: (ONE_ETH - ONE_ETH / 1000n).toString(),
            endAmount: (ONE_ETH - ONE_ETH / 1000n).toString(),
            recipient: OTHER_WALLET,
          },
        ],
      }),
    })
    expect('error' in checked && checked.error).toContain(
      `past the ${MAX_FEE_BPS} bps ceiling`,
    )
  })

  it('signs a schedule sitting exactly on the ceiling', () => {
    const fee = (ONE_ETH * BigInt(MAX_FEE_BPS)) / 10_000n
    const checked = checkListingOrder({
      ...base,
      message: listingMessage({
        consideration: [
          {
            itemType: ITEM_TYPE.NATIVE,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: (ONE_ETH - fee).toString(),
            endAmount: (ONE_ETH - fee).toString(),
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
      }),
    })
    expect('components' in checked).toBe(true)
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
    /** The WETH the bidder pays for the WHOLE offer, as the wire carries it. */
    proceeds?: bigint
    /** Items the bid covers. A collection offer is routinely for several. */
    quantity?: number
    /** Drop the NFT consideration leg, leaving the offer unpriceable. */
    noConsideration?: boolean
    contract?: string
    encoded?: string | null
    traits?: unknown
    protocolAddress?: string
    status?: string
  } = {},
) {
  const proceeds = overrides.proceeds ?? ONE_ETH / 2n
  const quantity = overrides.quantity ?? 1
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
        consideration: overrides.noConsideration
          ? []
          : [
              {
                itemType: ITEM_TYPE.ERC721_WITH_CRITERIA,
                token: overrides.contract ?? DOODLES,
                identifierOrCriteria: '0',
                startAmount: String(quantity),
                endAmount: String(quantity),
                recipient: OTHER_WALLET,
              },
            ],
      },
    },
    remaining_quantity: quantity,
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

// ── 8. The money bugs the signing-path review found ────────────────────

describe('a market buy carries the ceiling the ticket showed', () => {
  it('refuses a sweep with no ceiling at all, before it fetches anything', async () => {
    const { ctx, keyReads } = makeContext((path) => {
      throw new Error(`unexpected request to ${path}`)
    })
    const { price: _quoted, ...noCeiling } = BUY_MARKET
    const result = await executeNftOrder(ctx, noCeiling)
    expect(result.success).toBe(false)
    expect(result.error).toContain('maximum price per item')
    expect(keyReads()).toBe(0)
  })

  it('refuses a book that re-priced between the quote and the confirm', async () => {
    // The ticket quoted 1.0 / 1.02 / 1.05 and sent the priciest of the three
    // plus a percent. By the time the button was held those listings were
    // taken, and the cheapest three are now five times the money.
    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/listings/collection/')) {
        return {
          listings: [
            listingFixture({ total: 4_900_000_000_000_000_000n }),
            listingFixture({ total: 5_000_000_000_000_000_000n }),
            listingFixture({ total: 5_100_000_000_000_000_000n }),
          ],
        }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      ...BUY_MARKET,
      size: 3,
      price: 1.0605,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('more than the price you set')
    expect(keyReads()).toBe(0)
  })

  it('still sweeps the ladder its ceiling was quoted from', async () => {
    stubRpc(() => GOOD_CONDUIT)
    const costs = [
      1_000_000_000_000_000_000n,
      1_020_000_000_000_000_000n,
      1_050_000_000_000_000_000n,
    ]
    let fills = 0
    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/listings/collection/')) {
        return { listings: costs.map((total) => listingFixture({ total })) }
      }
      if (path === '/listings/fulfillment_data') {
        const value = costs[fills] ?? 0n
        fills += 1
        return fulfilmentFixture(value)
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      ...BUY_MARKET,
      size: 3,
      price: 1.0605,
    })
    // Every listing sits under the per-item ceiling and the basket under the
    // total, so the run reaches the key and stops there.
    expect(result.error).toBe('Wallet private key not found')
    expect(keyReads()).toBe(1)
    expect(fills).toBe(3)
  })
})

describe('criteria resolvers name the token the caller chose', () => {
  const resolver = (identifier: unknown) => ({
    orderIndex: 0,
    side: 0,
    index: 0,
    identifier,
    criteriaProof: [],
  })

  it('refuses a resolver pointing at another token in the same collection', () => {
    // The wallet holds the floor Doodle and a grail. The user picked the floor;
    // the response resolves the grail, whose criteria root is 0 so Seaport
    // would never check a proof.
    const anchored = anchorCriteriaResolvers([resolver(17)], 4021n)
    expect('error' in anchored && anchored.error).toContain('#17')
  })

  it('re-encodes the identifier from its own bigint', () => {
    const anchored = anchorCriteriaResolvers([resolver('4021')], 4021n)
    expect('resolvers' in anchored).toBe(true)
    if ('resolvers' in anchored) {
      expect(anchored.resolvers).toHaveLength(1)
      expect(anchored.resolvers[0].identifier).toBe(4021n)
      expect(anchored.resolvers[0].criteriaProof).toEqual([])
    }
  })

  it('refuses a resolver when the order names no token, and allows none', () => {
    const unanchored = anchorCriteriaResolvers([resolver(17)], null)
    expect('error' in unanchored && unanchored.error).toContain(
      'no token to anchor it to',
    )
    expect(anchorCriteriaResolvers([], null)).toEqual({ resolvers: [] })
    expect('error' in anchorCriteriaResolvers('nonsense', 1n)).toBe(true)
  })

  it('carries the refusal through planFulfillCall', () => {
    const planned = planFulfillCall({
      functionSignature: 'fulfillAdvancedOrder((..),(..)[],bytes32,address)',
      inputData: {
        advancedOrder: {},
        criteriaResolvers: [resolver(17)],
        fulfillerConduitKey: ZERO_HASH,
        recipient: WALLET,
      },
      seaport: DEFAULT_SEAPORT,
      fulfiller: WALLET,
      identifier: 4021n,
    })
    expect('error' in planned && planned.error).toContain('#17')
  })

  it('refuses the sale rather than ship a token the user did not pick', async () => {
    stubRpc((method) => {
      if (method === 'eth_call') return ownerOfResult(WALLET)
      if (method === 'eth_chainId') return '0x1'
      return '0x'
    })
    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/offers/collection/')) {
        return { offers: [offerFixture({ proceeds: 3n * ONE_ETH })] }
      }
      if (path === '/offers/fulfillment_data') {
        return {
          fulfillment_data: {
            transaction: {
              function: 'fulfillAdvancedOrder((..),(..)[],bytes32,address)',
              chain: 1,
              to: DEFAULT_SEAPORT.address,
              value: '0',
              input_data: {
                advancedOrder: {},
                criteriaResolvers: [resolver(17)],
                fulfillerConduitKey: OPENSEA_CONDUIT_KEY,
                recipient: WALLET,
              },
            },
          },
        }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'sell',
      type: 'market',
      size: 1,
      tokenId: '4021',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('#17')
    expect(keyReads()).toBe(0)
  })
})

describe('a multi-item offer prices per item, never in total', () => {
  const run = { contract: DOODLES as `0x${string}`, chainSlug: 'ethereum' }

  it('ranks a single 2 ETH bid above a five-item 5 ETH one', () => {
    const best = pickBestOffer(
      run,
      [
        offerFixture({ proceeds: 5n * ONE_ETH, quantity: 5 }),
        offerFixture({ proceeds: 2n * ONE_ETH, quantity: 1 }),
      ],
      42n,
    )
    expect('proceeds' in best && best.proceeds).toBe(2n * ONE_ETH)
  })

  it('skips an offer whose quantity cannot be read', () => {
    const unpriceable = pickBestOffer(
      run,
      [offerFixture({ noConsideration: true })],
      42n,
    )
    expect('error' in unpriceable).toBe(true)
    expect(offeredQuantity({ consideration: [] })).toBeNull()
    expect(
      offeredQuantity({
        consideration: [
          {
            itemType: ITEM_TYPE.ERC1155_WITH_CRITERIA,
            startAmount: '5',
          },
        ],
      }),
    ).toBe(5n)
  })

  it('holds the floor against a bulk bid whose TOTAL would clear it', async () => {
    // Five items for 5 ETH is 1 ETH a token. Read as a total it beats a 4 ETH
    // floor and sells one Doodle for a quarter of what the seller demanded.
    const { ctx, keyReads } = makeContext((path) => {
      if (path.startsWith('/offers/collection/')) {
        return {
          offers: [offerFixture({ proceeds: 5n * ONE_ETH, quantity: 5 })],
        }
      }
      throw new Error(`unexpected request to ${path}`)
    })
    const result = await executeNftOrder(ctx, {
      action: 'place',
      side: 'sell',
      type: 'market',
      size: 1,
      price: 4,
      tokenId: '42',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('below the floor you set')
    expect(keyReads()).toBe(0)
  })
})

describe('a short sweep reports what it filled', () => {
  it('counts the fills rather than the size it was handed', () => {
    const short = sweepResult({
      hashes: ['0x1', '0x2', '0x3'],
      available: 3,
      size: 10,
      shortfall: null,
    })
    expect(short.success).toBe(true)
    expect(short.filled).toBe(3)
    expect(short.error).toContain('Filled 3 of 10')
    expect(short.error).toContain('only 3 listing(s)')
  })

  it('keeps the on-chain reason when a fill reverted mid-run', () => {
    const stopped = sweepResult({
      hashes: ['0x1'],
      available: 3,
      size: 3,
      shortfall: 'A fill reverted on-chain (tx 0x2)',
    })
    expect(stopped.filled).toBe(1)
    expect(stopped.error).toContain('reverted on-chain')
  })

  it('says nothing extra when the whole sweep filled', () => {
    const full = sweepResult({
      hashes: ['0x1', '0x2'],
      available: 2,
      size: 2,
      shortfall: null,
    })
    expect(full.filled).toBe(2)
    expect(full.error).toBeUndefined()
    expect(full.orderId).toBe('0x1,0x2')
  })

  it('is a refusal when nothing filled at all', () => {
    const none = sweepResult({
      hashes: [],
      available: 1,
      size: 1,
      shortfall: 'A fill failed to send',
    })
    expect(none.success).toBe(false)
    expect(none.filled).toBeUndefined()
    expect(none.error).toBe('A fill failed to send')
  })
})
