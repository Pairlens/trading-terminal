// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The four things a user can do to an NFT market, signed with the user's own
 * key, in the user's own process. No relayer, no custody, no server.
 *
 * This is the write half of the OpenSea connector. Everything that reads lives
 * elsewhere and stays structurally read-only: no key, no calldata, no wallet
 * slot. Everything that signs is here.
 *
 * WHAT IS CHECKED BEFORE ANYTHING IS SIGNED, in order, all fail closed:
 *
 *   1. The action is `place`, the side/type pair is one of the four intents, and
 *      the size is a whole number of items inside the sweep ceiling. An NFT is
 *      indivisible, so a fractional size is a bug rather than a rounding
 *      artefact.
 *   2. The chain can actually settle a Seaport order. Solana is refused by name
 *      (OpenSea indexes it, but its Solana orders are not Seaport, so there is
 *      nothing here that could sign one) and every other chain outside
 *      `TRADABLE_CHAINS` is refused with the same finality.
 *   3. The collection contract, the wallet address and the token id parse, and
 *      the wallet slot actually carries a key accessor.
 *   4. The order OpenSea returned is anchored to the order we ASKED for: its
 *      chain, its collection contract, its token id, its quantity and its
 *      protocol address. A response that echoes something else is a refusal, not
 *      an input.
 *   5. `protocol_address` is one of the PINNED Seaport deployments
 *      (`seaport.ts`), and the conduit any approval would be granted to is
 *      confirmed on-chain through `ConduitController.getConduit` before the
 *      approval is built. A hardcoded address is a claim; only the chain can
 *      confirm it.
 *   6. The money is bounded. A buy spends at most what the caller authorised,
 *      computed LOCALLY by summing the listing's own signed consideration, and
 *      never the `value` the API echoed back. A sweep is capped in total, not
 *      just per item. An offer's exposure is the offer amount itself, which is
 *      built here. A sale checks the floor the caller set, when they set one.
 *   7. `ownerOf` (or the ERC-1155 `balanceOf`) says the wallet holds the token
 *      it is about to sell. A marketplace would reject a listing from a
 *      non-owner anyway; refusing here costs no gas and says why.
 *   8. Only then is the private key fetched, and the account it derives must
 *      equal the slot's address or nothing is sent.
 *
 * ERRORS ARE DATA. Every failure above returns `{success:false, error}` the way
 * the DEX connectors do, because a refusal, a revert and a dead RPC are all
 * results a trade ticket can render, and none of them should be a throw the
 * caller has to catch to keep a workspace alive.
 *
 * ROYALTIES ARE PAID BY DEFAULT. OpenSea returns creator fees in basis points
 * with a `required` flag, and on most collections the creator fee is now
 * optional. Dropping an optional royalty is a choice about somebody else's
 * income, not an optimisation, so `use_creator_fee` is always true and optional
 * fee items are included in every order this module builds.
 *
 * WHAT IS DELIBERATELY REFUSED rather than implemented:
 *
 *   - A listing priced in an ERC-20. Paying one means granting a token
 *     allowance to the conduit on the BUY side, and the price a user authorised
 *     would then be denominated in something the ticket did not quote. Refused
 *     with a clear message on both the buy and the sell path.
 *   - A declining (Dutch) listing, where `startAmount != endAmount`. Its price
 *     at fill time depends on the including block's timestamp, so no client-side
 *     total is the total. Refusing beats signing a spend we cannot bound.
 *   - A trait offer, when accepting an offer for a specific token. The
 *     criteria root is not reproducible client-side, so a trait offer cannot be
 *     confirmed to cover the token being sold.
 */
import { getViemChain } from '../evm-dex-connector/chains'
import { ERC20_ABI } from '../evm-dex-connector/swap-executor'
import {
  CONDUIT_CONTROLLER,
  CONDUIT_CONTROLLER_ABI,
  DEFAULT_SEAPORT,
  ITEM_TYPE,
  NFT_ABI,
  OPENSEA_CONDUIT,
  OPENSEA_CONDUIT_KEY,
  ORDER_TYPE,
  SEAPORT_EIP712_TYPES,
  SEAPORT_FULFILL_ABI,
  SEAPORT_READ_ABI,
  TRADING_RPC,
  WRAPPED_NATIVE,
  ZERO_ADDRESS,
  considerationTotals,
  decimalToWei,
  isBytes32,
  isEvmAddress,
  operatorForConduitKey,
  planFulfillCall,
  randomSalt,
  resolveSeaport,
  sameAddress,
  seaportDomain,
  toUint,
} from './seaport'
import { EVM_CHAIN_ID, OPENSEA_CHAIN, isTradableChain } from './types'
import type {
  SeaportConsiderationItem,
  SeaportDeployment,
  SeaportOrderComponents,
} from './seaport'
import type { OpenSeaRequest, WalletSlot } from './types'
import type { NftChain } from '@pairlens/shared/nft-types'

// ── Policy numbers, all of them arguable and all of them written down ──

/**
 * The most listings one sweep will fulfil.
 *
 * A sweep is N sequential transactions, each with its own gas and its own
 * chance to revert, and a ticket that quietly fires eighty of them is not a
 * ticket. Fifty is well past any real sweep and still bounded.
 */
export const MAX_SWEEP_ITEMS = 50

/** How long a collection offer stays live. Long enough to be filled, short
 * enough that a forgotten bid expires on its own. */
export const OFFER_DURATION_SECONDS = 24 * 60 * 60

/**
 * Tolerance when checking that an order OpenSea assembled prices the item at
 * what the user asked, in basis points.
 *
 * Applies to a SALE only, where the fee split is rounded per recipient and the
 * total can land a few wei off. It is deliberately not applied to a buy: on the
 * spend side there is no reason to accept "close enough" upward, so a buy is
 * bounded exactly.
 */
export const PRICE_TOLERANCE_BPS = 25

/**
 * Ceiling on the marketplace-plus-creator fee an order will carry, in basis
 * points.
 *
 * Royalties are paid by default, which means the fee list from the API decides
 * how much of the offer leaves to somebody other than the seller. Paying a
 * creator is the point; paying an unbounded one is a fee list nobody validated.
 * OpenSea's own fee is 250 bps and the largest legitimate creator fee in wide
 * use is 1000 bps, so 2000 refuses only the absurd.
 */
export const MAX_FEE_BPS = 2_000

/** Clock skew allowed when checking an assembled order's `startTime`. */
const START_TIME_SLACK_SECONDS = 300

// ── The contract with the rest of the connector ────────────────────────

export type NftOrderContext = {
  apiKey: string
  chain: NftChain
  slug: string
  contract: string
  slot: WalletSlot
  request: OpenSeaRequest
}

export type NftOrderParams = {
  action: 'place'
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  /** Item count, always a whole number. */
  size: number
  /**
   * Native currency per item. Required on a limit order, where it is the price
   * being posted. Optional on a market order, where it is a BOUND: a ceiling per
   * item when buying, a floor per item when selling.
   */
  price?: number
  tokenId?: string
  clientOrderId?: string
}

export type NftOrderResult = {
  success: boolean
  orderId?: string
  error?: string
}

function fail(error: string): NftOrderResult {
  return { success: false, error }
}

function describe(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

// ── Entry point ────────────────────────────────────────────────────────

/**
 * Place one NFT order and report what happened.
 *
 * Four intents ride one signature, because a trade ticket has one shape and an
 * NFT market has the same two sides as any other market. `buy + market` sweeps
 * the cheapest listings, `buy + limit` posts a collection offer, `sell + limit`
 * lists a token, `sell + market` accepts the best standing bid on it.
 */
export async function executeNftOrder(
  ctx: NftOrderContext,
  params: NftOrderParams,
): Promise<NftOrderResult> {
  // 1. The shape of the request itself, before anything is fetched.
  if (params.action !== 'place') {
    return fail(`OpenSea orders support 'place' only, not '${params.action}'`)
  }
  if (params.side !== 'buy' && params.side !== 'sell') {
    return fail(`Unknown order side '${params.side}'`)
  }
  if (params.type !== 'market' && params.type !== 'limit') {
    return fail(`Unknown order type '${params.type}'`)
  }
  const size = params.size
  if (!Number.isInteger(size) || size < 1) {
    return fail('An NFT order size is a whole number of items, at least 1')
  }
  if (size > MAX_SWEEP_ITEMS) {
    return fail(`One order covers at most ${MAX_SWEEP_ITEMS} items`)
  }

  // 2. The chain. Solana by name, because it is the one that looks tradable.
  if (ctx.chain === 'solana') {
    return fail(
      'OpenSea settles Solana orders outside Seaport, so this connector cannot sign one. Solana NFT trading is read-only here.',
    )
  }
  if (!isTradableChain(ctx.chain)) {
    return fail(
      `This connector does not sign orders on ${ctx.chain}. Trading is limited to the chains it has been verified against.`,
    )
  }
  const chainId = EVM_CHAIN_ID[ctx.chain]
  const rpcUrl = TRADING_RPC[ctx.chain]
  const weth = WRAPPED_NATIVE[ctx.chain]
  const chainSlug = OPENSEA_CHAIN[ctx.chain]
  if (!chainId || !rpcUrl || !weth) {
    return fail(`No signing configuration for ${ctx.chain}. Refusing to sign.`)
  }

  // 3. Identity: the collection, the wallet, the token.
  if (!isEvmAddress(ctx.contract)) {
    return fail(`'${ctx.contract}' is not an EVM collection address`)
  }
  if (!isEvmAddress(ctx.slot.address)) {
    return fail('The wallet slot does not carry an EVM address')
  }
  const getPrivateKey = ctx.slot.getPrivateKey
  if (!getPrivateKey) {
    return fail(
      'No wallet is connected for this venue. Connect one in Accounts, then place the order again.',
    )
  }
  const wallet = ctx.slot.address
  const contract = ctx.contract

  let tokenId: bigint | null = null
  if (params.tokenId !== undefined) {
    tokenId = toUint(params.tokenId)
    if (tokenId === null) return fail(`'${params.tokenId}' is not a token id`)
  }

  // 4. The price, which is mandatory on a limit order and a bound on a market
  //    one. Converted through a decimal string rather than a float, so a small
  //    price cannot arrive in exponent notation and be misread.
  let priceWei: bigint | null = null
  if (params.price !== undefined) {
    priceWei = decimalToWei(params.price)
    if (priceWei === null || priceWei <= 0n) {
      return fail(`'${params.price}' is not a usable price`)
    }
  }
  if (params.type === 'limit' && priceWei === null) {
    return fail('A limit order needs a price')
  }
  if (params.side === 'sell' && tokenId === null) {
    return fail('Selling needs the token id of the item to sell')
  }

  const shared: OrderRun = {
    ctx,
    params,
    size,
    chainId,
    rpcUrl,
    weth,
    chainSlug,
    wallet,
    contract,
    tokenId,
    priceWei,
    getPrivateKey,
  }

  try {
    if (params.side === 'buy' && params.type === 'market')
      return await sweep(shared)
    if (params.side === 'buy') return await makeCollectionOffer(shared)
    if (params.type === 'limit') return await listToken(shared)
    return await acceptBestOffer(shared)
  } catch (err) {
    return fail(describe(err, 'The OpenSea order failed'))
  }
}

type OrderRun = {
  ctx: NftOrderContext
  params: NftOrderParams
  size: number
  chainId: number
  rpcUrl: string
  weth: `0x${string}`
  chainSlug: string
  wallet: `0x${string}`
  contract: `0x${string}`
  tokenId: bigint | null
  priceWei: bigint | null
  getPrivateKey: () => Promise<string | null>
}

// ── viem, the clients, and the signer ──────────────────────────────────

/**
 * viem is imported dynamically everywhere below, exactly as `swap-executor`
 * does it: the EVM stack is roughly a megabyte and a user reading an NFT board
 * has no reason to download it until they place an order.
 */
async function viemFor(run: OrderRun) {
  const viem = await import('viem')
  const chain = await getViemChain(run.ctx.chain)
  const transport = viem.http(run.rpcUrl)
  const publicClient = viem.createPublicClient({ chain, transport })
  return { viem, chain, transport, publicClient }
}

type ViemBundle = Awaited<ReturnType<typeof viemFor>>

/**
 * Fetch the key, derive the account, and refuse if it is not the slot's.
 *
 * Called LAST on every path. A refusal that has already read the vault is a
 * refusal that has given up the property it exists to protect.
 */
async function signerFor(run: OrderRun, bundle: ViemBundle) {
  const privateKey = await run.getPrivateKey()
  if (!privateKey) {
    return { ok: false as const, error: 'Wallet private key not found' }
  }
  const { privateKeyToAccount } = await import('viem/accounts')
  const account = privateKeyToAccount(
    (privateKey.startsWith('0x')
      ? privateKey
      : `0x${privateKey}`) as `0x${string}`,
  )
  if (!sameAddress(account.address, run.wallet)) {
    return { ok: false as const, error: 'Private key does not match wallet' }
  }
  const walletClient = bundle.viem.createWalletClient({
    account,
    chain: bundle.chain,
    transport: bundle.transport,
  })
  return { ok: true as const, account, walletClient }
}

/**
 * Confirm the pinned conduit against the chain before anything is approved.
 *
 * Same discipline as `lp-writer` re-reading a position manager's `factory()`.
 * The conduit address in `seaport.ts` was verified once, by hand, on both
 * chains; this makes the check part of every order, so a table that goes stale
 * fails closed instead of routing an approval somewhere new.
 */
async function assertConduit(
  bundle: ViemBundle,
  operator: `0x${string}`,
  seaport: SeaportDeployment,
): Promise<string | null> {
  if (sameAddress(operator, seaport.address)) return null
  if (!sameAddress(operator, OPENSEA_CONDUIT)) {
    return `Refusing to approve an unrecognised operator ${operator}`
  }
  const [conduit, exists] = await bundle.publicClient.readContract({
    address: CONDUIT_CONTROLLER,
    abi: CONDUIT_CONTROLLER_ABI,
    functionName: 'getConduit',
    args: [OPENSEA_CONDUIT_KEY],
  })
  if (!exists || !sameAddress(conduit, OPENSEA_CONDUIT)) {
    return 'The pinned OpenSea conduit does not match the one the chain reports. Refusing to approve.'
  }
  return null
}

// ── Intent 1: buy + market, the sweep ──────────────────────────────────

type CheckedListing = {
  hash: string
  seaport: SeaportDeployment
  /** Native currency this fill costs, summed from the maker's own order. */
  cost: bigint
  identifier: string | null
}

/**
 * Fulfil the `size` cheapest listings, one transaction each.
 *
 * Every listing is validated BEFORE the first one is bought, and the total is
 * capped before the key is touched: a sweep that discovers its third item is
 * mispriced after buying two has already spent the money.
 */
async function sweep(run: OrderRun): Promise<NftOrderResult> {
  const { ctx, size } = run
  const path =
    run.tokenId !== null
      ? `/listings/collection/${encodeURIComponent(ctx.slug)}/nfts/${run.tokenId}/best`
      : `/listings/collection/${encodeURIComponent(ctx.slug)}/best?limit=${size}`

  const raw = await ctx.request<unknown>(path)
  const listings = asListingArray(raw).slice(0, size)
  if (listings.length === 0) {
    return fail('OpenSea has no listing for this collection right now')
  }

  const checked: Array<CheckedListing> = []
  for (const listing of listings) {
    const result = checkListing(run, listing)
    if ('error' in result) return fail(result.error)
    checked.push(result.listing)
  }

  // The spend cap. With a per-item ceiling the caller set it; without one the
  // quote IS the authorisation, and the transaction below is anchored to the
  // same numbers this total was summed from.
  const quoted = checked.reduce((sum, item) => sum + item.cost, 0n)
  const authorised =
    run.priceWei !== null ? run.priceWei * BigInt(checked.length) : quoted
  if (quoted > authorised) {
    return fail(
      `Refusing to buy: the cheapest ${checked.length} listing(s) total more than the price you authorised`,
    )
  }

  const bundle = await viemFor(run)

  // Build and validate every transaction before signing any of them.
  const calls: Array<{
    to: `0x${string}`
    data: `0x${string}`
    value: bigint
  }> = []
  for (const item of checked) {
    const built = await buildFill(run, bundle, item)
    if ('error' in built) return fail(built.error)
    calls.push(built.call)
  }

  const signer = await signerFor(run, bundle)
  if (!signer.ok) return fail(signer.error)

  const hashes: Array<string> = []
  let shortfall: string | null = null
  for (const call of calls) {
    try {
      const hash = await signer.walletClient.sendTransaction({
        to: call.to,
        data: call.data,
        value: call.value,
      })
      const receipt = await bundle.publicClient.waitForTransactionReceipt({
        hash,
      })
      if (receipt.status !== 'success') {
        shortfall = `A fill reverted on-chain (tx ${hash})`
        break
      }
      hashes.push(hash)
    } catch (err) {
      shortfall = describe(err, 'A fill failed to send')
      break
    }
  }

  if (hashes.length === 0) {
    return fail(shortfall ?? 'No listing could be filled')
  }
  // A partial sweep is a success with a reason attached: items were bought, and
  // the ticket has to be able to say both how many and why it stopped.
  return {
    success: true,
    orderId: hashes.join(','),
    ...(shortfall
      ? { error: `Filled ${hashes.length} of ${calls.length}. ${shortfall}` }
      : {}),
  }
}

/** Anchor one listing to the collection, chain and token that were asked for. */
function checkListing(
  run: OrderRun,
  listing: Record<string, unknown>,
): { listing: CheckedListing } | { error: string } {
  const hash = listing['order_hash']
  if (typeof hash !== 'string' || hash.length === 0) {
    return { error: 'OpenSea returned a listing with no order hash' }
  }
  const listingChain = listing['chain']
  if (typeof listingChain === 'string' && listingChain !== run.chainSlug) {
    return {
      error: `Refusing to buy: the listing is on ${listingChain}, not ${run.chainSlug}`,
    }
  }
  const seaport = resolveSeaport(listing['protocol_address'])
  if (!seaport) {
    return {
      error: `Refusing to buy: the listing names an unpinned protocol contract ${String(listing['protocol_address'])}`,
    }
  }

  const protocolData = listing['protocol_data']
  const parameters =
    protocolData && typeof protocolData === 'object'
      ? (protocolData as Record<string, unknown>)['parameters']
      : undefined
  if (!parameters || typeof parameters !== 'object') {
    return { error: 'OpenSea returned a listing with no order parameters' }
  }
  const order = parameters as Record<string, unknown>

  const offer = order['offer']
  if (!Array.isArray(offer) || offer.length !== 1) {
    return {
      error:
        'Refusing to buy: this listing bundles several items, which this ticket cannot price',
    }
  }
  const offered = offer[0] as Record<string, unknown>
  const offeredType = Number(toUint(offered['itemType']) ?? -1n)
  if (offeredType !== ITEM_TYPE.ERC721 && offeredType !== ITEM_TYPE.ERC1155) {
    return { error: 'Refusing to buy: the listing does not offer an NFT' }
  }
  if (!sameAddress(offered['token'], run.contract)) {
    return {
      error: `Refusing to buy: the listing is for ${String(offered['token'])}, not ${run.contract}`,
    }
  }
  const identifier = toUint(offered['identifierOrCriteria'])
  if (identifier === null) {
    return { error: 'Refusing to buy: the listing has no token identifier' }
  }
  if (run.tokenId !== null && identifier !== run.tokenId) {
    return {
      error: `Refusing to buy: OpenSea answered with token #${identifier}, not #${run.tokenId}`,
    }
  }

  const totals = considerationTotals(order['consideration'])
  if (!totals) {
    return { error: 'Refusing to buy: the listing has no readable price' }
  }
  if (totals.hasNonNative) {
    return {
      error: `Refusing to buy: this listing is priced in a token rather than native currency, which this ticket does not quote`,
    }
  }
  if (totals.isDeclining) {
    return {
      error:
        'Refusing to buy: this is a declining-price listing, whose cost at inclusion cannot be bounded here',
    }
  }
  if (totals.native <= 0n) {
    return { error: 'Refusing to buy: the listing prices the item at zero' }
  }
  if (run.priceWei !== null && totals.native > run.priceWei) {
    return {
      error: 'Refusing to buy: a listing costs more than the price you set',
    }
  }

  return {
    listing: {
      hash,
      seaport,
      cost: totals.native,
      identifier: identifier.toString(),
    },
  }
}

/**
 * Ask OpenSea for the fill calldata, then decide the target and the value here.
 *
 * The calldata itself is passed through: it encodes the maker's signature over
 * the order, which no client can reproduce. What that leaves open is bounded,
 * and each part is closed separately. The target is a pinned Seaport. The
 * function is one of four on an allowlist. The recipient is forced to the
 * signer. And the value is the sum this module took off the maker's own signed
 * consideration, so a fulfilment response that wants more money than the listing
 * asks for cannot get it.
 */
async function buildFill(
  run: OrderRun,
  bundle: ViemBundle,
  item: CheckedListing,
): Promise<
  | { call: { to: `0x${string}`; data: `0x${string}`; value: bigint } }
  | { error: string }
> {
  const response = await run.ctx.request<Record<string, unknown>>(
    '/listings/fulfillment_data',
    {
      method: 'POST',
      body: {
        listing: {
          hash: item.hash,
          chain: run.chainSlug,
          protocol_address: item.seaport.address,
        },
        fulfiller: { address: run.wallet },
      },
    },
  )
  return encodeFulfilment(run, bundle, response, item.seaport, item.cost)
}

/** Shared by the buy path and the accept-an-offer path. */
async function encodeFulfilment(
  run: OrderRun,
  bundle: ViemBundle,
  response: Record<string, unknown>,
  seaport: SeaportDeployment,
  localValue: bigint,
): Promise<
  | { call: { to: `0x${string}`; data: `0x${string}`; value: bigint } }
  | { error: string }
> {
  const data = response['fulfillment_data']
  const transaction =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)['transaction']
      : undefined
  if (!transaction || typeof transaction !== 'object') {
    return { error: 'OpenSea returned no fulfilment transaction' }
  }
  const tx = transaction as Record<string, unknown>

  if (!sameAddress(tx['to'], seaport.address)) {
    return {
      error: `Refusing to send: the fulfilment targets ${String(tx['to'])} rather than the pinned Seaport ${seaport.address}`,
    }
  }
  const txChain = toUint(tx['chain'])
  if (txChain !== null && Number(txChain) !== run.chainId) {
    return {
      error: `Refusing to send: the fulfilment is built for chain ${txChain}, not ${run.chainId}`,
    }
  }
  if (!valueAgrees(tx['value'], localValue)) {
    return {
      error:
        'Refusing to send: OpenSea asks for a different amount than the order itself prices. Nothing was sent.',
    }
  }

  const planned = planFulfillCall({
    functionSignature: tx['function'],
    inputData: tx['input_data'],
    seaport,
    fulfiller: run.wallet,
  })
  if ('error' in planned) return { error: planned.error }

  const conduitError = await assertConduit(bundle, planned.operator, seaport)
  if (conduitError) return { error: conduitError }

  let encoded: `0x${string}`
  try {
    encoded = bundle.viem.encodeFunctionData({
      abi: SEAPORT_FULFILL_ABI,
      functionName: planned.plan.functionName,
      args: planned.plan.args,
    } as Parameters<typeof bundle.viem.encodeFunctionData>[0])
  } catch (err) {
    return {
      error: `Refusing to send: the fulfilment arguments do not fit Seaport's ABI (${describe(err, 'encode failed')})`,
    }
  }

  // OpenSea appends a source tag past the end of the ABI-encoded arguments.
  // Solidity ignores trailing calldata, which is what makes the tag harmless,
  // and it is only appended when it is well-formed hex.
  const suffix = tx['calldata_suffix']
  if (typeof suffix === 'string' && /^(0x)?[0-9a-fA-F]*$/.test(suffix)) {
    encoded = `${encoded}${suffix.replace(/^0x/, '')}` as `0x${string}`
  }

  return {
    call: { to: seaport.address, data: encoded, value: localValue },
  }
}

/**
 * Cross-check the echoed value against the one computed locally.
 *
 * The local number always wins; this only decides whether to proceed at all. A
 * value that parses exactly must match exactly. A value OpenSea serialised as a
 * JSON number past `Number.MAX_SAFE_INTEGER` cannot be read exactly by anyone,
 * so it is compared as a float within a hair, which still catches a response
 * asking for a different order of magnitude.
 */
export function valueAgrees(echoed: unknown, local: bigint): boolean {
  if (echoed === undefined || echoed === null) return true
  const exact = toUint(echoed)
  if (exact !== null) return exact === local
  if (typeof echoed !== 'number' || !Number.isFinite(echoed)) return false
  const localFloat = Number(local)
  if (localFloat === 0) return echoed === 0
  return Math.abs(echoed - localFloat) / localFloat < 1e-6
}

// ── Intent 2: buy + limit, a collection offer ──────────────────────────

/**
 * Post a gasless WETH bid for any `size` items in the collection.
 *
 * The order is ASSEMBLED here rather than accepted from the API, and that split
 * is the security property: OpenSea supplies only the criteria root (which no
 * client can compute), the zone and the fee recipients, while the offerer, the
 * token, the amounts and the recipient of the item are all built locally. The
 * worst a wrong root can do is match a different token inside the same pinned
 * contract, which is what a collection offer means anyway.
 */
async function makeCollectionOffer(run: OrderRun): Promise<NftOrderResult> {
  const priceWei = run.priceWei
  if (priceWei === null) return fail('A collection offer needs a price')
  const total = priceWei * BigInt(run.size)

  const build = await run.ctx.request<Record<string, unknown>>(
    '/offers/build',
    {
      method: 'POST',
      body: {
        offerer: run.wallet,
        quantity: run.size,
        criteria: { collection: { slug: run.ctx.slug } },
        protocol_address: DEFAULT_SEAPORT.address,
      },
    },
  )
  const partialRaw = build['partialParameters'] ?? build['partial_parameters']
  if (!partialRaw || typeof partialRaw !== 'object') {
    return fail('OpenSea did not return the criteria for this collection')
  }
  const partial = partialRaw as Record<string, unknown>

  const criteriaList = partial['consideration']
  if (!Array.isArray(criteriaList) || criteriaList.length !== 1) {
    return fail('OpenSea returned an offer criteria this connector cannot read')
  }
  const criteria = criteriaList[0] as Record<string, unknown>
  const criteriaType = Number(toUint(criteria['itemType']) ?? -1n)
  if (
    criteriaType !== ITEM_TYPE.ERC721_WITH_CRITERIA &&
    criteriaType !== ITEM_TYPE.ERC1155_WITH_CRITERIA
  ) {
    return fail('Refusing to sign: the offer criteria is not an NFT criteria')
  }
  if (!sameAddress(criteria['token'], run.contract)) {
    return fail(
      `Refusing to sign: OpenSea built the offer against ${String(criteria['token'])}, not ${run.contract}`,
    )
  }
  const criteriaRoot = toUint(criteria['identifierOrCriteria'])
  if (criteriaRoot === null) {
    return fail('Refusing to sign: the offer criteria has no root')
  }

  const zone = isEvmAddress(partial['zone']) ? partial['zone'] : ZERO_ADDRESS
  const zoneHash = isBytes32(partial['zoneHash'])
    ? partial['zoneHash']
    : (`0x${'0'.repeat(64)}` as const)

  // Fees, paid in full. `required: false` is a creator asking rather than
  // insisting, and this connector answers yes.
  const fees = await collectionFees(run)
  if ('error' in fees) return fail(fees.error)
  const feeItems: Array<SeaportConsiderationItem> = fees.entries.map((fee) => ({
    itemType: ITEM_TYPE.ERC20,
    token: run.weth,
    identifierOrCriteria: 0n,
    startAmount: (total * BigInt(fee.bps)) / 10_000n,
    endAmount: (total * BigInt(fee.bps)) / 10_000n,
    recipient: fee.recipient,
  }))

  const bundle = await viemFor(run)

  const counter = await bundle.publicClient.readContract({
    address: DEFAULT_SEAPORT.address,
    abi: SEAPORT_READ_ABI,
    functionName: 'getCounter',
    args: [run.wallet],
  })

  const balance = await bundle.publicClient.readContract({
    address: run.weth,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [run.wallet],
  })
  if (balance < total) {
    return fail(
      'Not enough WETH to back this offer. An NFT bid is held in wrapped ether, so wrap some first.',
    )
  }

  const conduitError = await assertConduit(
    bundle,
    OPENSEA_CONDUIT,
    DEFAULT_SEAPORT,
  )
  if (conduitError) return fail(conduitError)

  const now = Math.floor(Date.now() / 1000)
  const components: SeaportOrderComponents = {
    offerer: run.wallet,
    zone,
    offer: [
      {
        itemType: ITEM_TYPE.ERC20,
        token: run.weth,
        identifierOrCriteria: 0n,
        startAmount: total,
        endAmount: total,
      },
    ],
    consideration: [
      {
        itemType: criteriaType,
        token: run.contract,
        identifierOrCriteria: criteriaRoot,
        startAmount: BigInt(run.size),
        endAmount: BigInt(run.size),
        // The item comes to us. Never a recipient from the response.
        recipient: run.wallet,
      },
      ...feeItems,
    ],
    // A bid for several items has to be partially fillable, or the first seller
    // to take one would consume the whole offer.
    orderType:
      run.size > 1
        ? zone === ZERO_ADDRESS
          ? ORDER_TYPE.PARTIAL_OPEN
          : ORDER_TYPE.PARTIAL_RESTRICTED
        : zone === ZERO_ADDRESS
          ? ORDER_TYPE.FULL_OPEN
          : ORDER_TYPE.FULL_RESTRICTED,
    startTime: BigInt(now),
    endTime: BigInt(now + OFFER_DURATION_SECONDS),
    zoneHash,
    salt: randomSalt(),
    conduitKey: OPENSEA_CONDUIT_KEY,
    counter,
  }

  const signer = await signerFor(run, bundle)
  if (!signer.ok) return fail(signer.error)

  // The conduit has to be able to pull the WETH when somebody takes the bid.
  // Approved for exactly the offer, never for an unbounded amount.
  const allowance = await bundle.publicClient.readContract({
    address: run.weth,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [run.wallet, OPENSEA_CONDUIT],
  })
  if (allowance < total) {
    const approveHash = await signer.walletClient.writeContract({
      address: run.weth,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OPENSEA_CONDUIT, total],
    })
    const receipt = await bundle.publicClient.waitForTransactionReceipt({
      hash: approveHash,
    })
    if (receipt.status !== 'success') {
      return fail('The WETH approval failed, so no offer was signed')
    }
  }

  const signature = await signer.account.signTypedData({
    domain: seaportDomain(DEFAULT_SEAPORT, run.chainId),
    types: SEAPORT_EIP712_TYPES,
    primaryType: 'OrderComponents',
    message: components,
  })

  const posted = await run.ctx.request<Record<string, unknown>>('/offers', {
    method: 'POST',
    body: {
      chain: run.chainSlug,
      protocol_address: DEFAULT_SEAPORT.address,
      criteria: { collection: { slug: run.ctx.slug } },
      protocol_data: {
        parameters: wireParameters(components),
        signature,
      },
    },
  })
  return { success: true, orderId: orderHashOf(posted) ?? undefined }
}

type CollectionFee = { bps: number; recipient: `0x${string}` }

/**
 * The fee schedule for the collection, in basis points.
 *
 * Every entry is kept, `required` or not. The only thing this rejects is a
 * schedule that adds up to more than `MAX_FEE_BPS`, or one that names something
 * that is not an address.
 */
async function collectionFees(
  run: OrderRun,
): Promise<{ entries: Array<CollectionFee> } | { error: string }> {
  let raw: Record<string, unknown>
  try {
    raw = await run.ctx.request<Record<string, unknown>>(
      `/collections/${encodeURIComponent(run.ctx.slug)}`,
    )
  } catch (err) {
    return { error: describe(err, 'The collection fees could not be read') }
  }
  const list = raw['fees']
  if (!Array.isArray(list)) return { entries: [] }
  const entries: Array<CollectionFee> = []
  let totalBps = 0
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const fee = item as Record<string, unknown>
    const recipient = fee['recipient']
    const percent = fee['fee']
    if (!isEvmAddress(recipient)) {
      return {
        error: 'Refusing to sign: a fee names something that is not an address',
      }
    }
    if (
      typeof percent !== 'number' ||
      !Number.isFinite(percent) ||
      percent < 0
    ) {
      return { error: 'Refusing to sign: a fee is not a readable percentage' }
    }
    const bps = Math.round(percent * 100)
    if (bps === 0) continue
    totalBps += bps
    entries.push({ bps, recipient })
  }
  if (totalBps > MAX_FEE_BPS) {
    return {
      error: `Refusing to sign: the fees on this collection total ${totalBps} bps, past the ${MAX_FEE_BPS} bps ceiling`,
    }
  }
  return { entries }
}

/** OrderComponents as OpenSea's book wants them: counter kept, arity added. */
function wireParameters(
  components: SeaportOrderComponents,
): Record<string, unknown> {
  const asString = (value: bigint) => value.toString()
  return {
    offerer: components.offerer,
    zone: components.zone,
    offer: components.offer.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: asString(item.identifierOrCriteria),
      startAmount: asString(item.startAmount),
      endAmount: asString(item.endAmount),
    })),
    consideration: components.consideration.map((item) => ({
      itemType: item.itemType,
      token: item.token,
      identifierOrCriteria: asString(item.identifierOrCriteria),
      startAmount: asString(item.startAmount),
      endAmount: asString(item.endAmount),
      recipient: item.recipient,
    })),
    orderType: components.orderType,
    startTime: asString(components.startTime),
    endTime: asString(components.endTime),
    zoneHash: components.zoneHash,
    salt: asString(components.salt),
    conduitKey: components.conduitKey,
    totalOriginalConsiderationItems: components.consideration.length,
    counter: asString(components.counter),
  }
}

function orderHashOf(response: Record<string, unknown>): string | null {
  const direct = response['order_hash']
  if (typeof direct === 'string') return direct
  const order = response['order']
  if (order && typeof order === 'object') {
    const nested = (order as Record<string, unknown>)['order_hash']
    if (typeof nested === 'string') return nested
  }
  return null
}

// ── Intent 3: sell + limit, list a token ───────────────────────────────

/**
 * List one token at a price, gasless after a one-time operator approval.
 *
 * OpenSea assembles the order (it owns the fee schedule and the zone), so this
 * path VALIDATES rather than builds. It takes the message fields out of the
 * actions response and signs them under this module's own pinned domain and
 * type set: a signature is only as good as the schema it was taken over, so the
 * envelope is never the response's.
 */
async function listToken(run: OrderRun): Promise<NftOrderResult> {
  const priceWei = run.priceWei
  const tokenId = run.tokenId
  if (priceWei === null || tokenId === null) {
    return fail('Listing a token needs both a token id and a price')
  }
  const total = priceWei * BigInt(run.size)

  const bundle = await viemFor(run)
  const ownership = await assertHolding(run, bundle, tokenId)
  if (ownership) return fail(ownership)

  const actions = await run.ctx.request<Record<string, unknown>>(
    '/listings/actions',
    {
      method: 'POST',
      body: {
        address: run.wallet,
        items: [
          {
            chain: run.chainSlug,
            contract: run.contract,
            token_id: tokenId.toString(),
            quantity: run.size,
            price: total.toString(),
          },
        ],
        // Royalties are paid. See this file's header.
        use_creator_fee: true,
      },
    },
  )

  const found = findOrderComponents(actions)
  if ('error' in found) return fail(found.error)
  const message = found.message

  const seaport = resolveSeaport(
    found.protocolAddress ?? DEFAULT_SEAPORT.address,
  )
  if (!seaport) {
    return fail(
      `Refusing to sign: OpenSea named an unpinned protocol contract ${String(found.protocolAddress)}`,
    )
  }

  const counter = await bundle.publicClient.readContract({
    address: seaport.address,
    abi: SEAPORT_READ_ABI,
    functionName: 'getCounter',
    args: [run.wallet],
  })

  const checked = checkListingOrder({
    run,
    message,
    tokenId,
    total,
    counter,
    seaport,
  })
  if ('error' in checked) return fail(checked.error)
  const components = checked.components

  const operator = operatorForConduitKey(components.conduitKey, seaport)
  if (!operator) {
    return fail(
      'Refusing to sign: the order routes through a conduit this connector does not recognise',
    )
  }
  const conduitError = await assertConduit(bundle, operator, seaport)
  if (conduitError) return fail(conduitError)

  const approved = await bundle.publicClient.readContract({
    address: run.contract,
    abi: NFT_ABI,
    functionName: 'isApprovedForAll',
    args: [run.wallet, operator],
  })

  const signer = await signerFor(run, bundle)
  if (!signer.ok) return fail(signer.error)

  if (!approved) {
    // Built here from the pinned operator, never from whatever transaction the
    // actions response suggested. This is the one approval a listing needs and
    // it is the only shape it may take.
    const hash = await signer.walletClient.writeContract({
      address: run.contract,
      abi: NFT_ABI,
      functionName: 'setApprovalForAll',
      args: [operator, true],
    })
    const receipt = await bundle.publicClient.waitForTransactionReceipt({
      hash,
    })
    if (receipt.status !== 'success') {
      return fail('The collection approval failed, so nothing was listed')
    }
  }

  const signature = await signer.account.signTypedData({
    domain: seaportDomain(seaport, run.chainId),
    types: SEAPORT_EIP712_TYPES,
    primaryType: 'OrderComponents',
    message: components,
  })

  const posted = await run.ctx.request<Record<string, unknown>>(
    `/orders/${run.chainSlug}/seaport/listings`,
    {
      method: 'POST',
      body: {
        parameters: wireParameters(components),
        signature,
        protocol_address: seaport.address,
      },
    },
  )
  return { success: true, orderId: orderHashOf(posted) ?? undefined }
}

/**
 * Validate an order OpenSea assembled, field by field, and rebuild it locally.
 *
 * Nothing from the response survives unchecked into the signed message: every
 * value is re-parsed into a bigint here, so a field that does not read as a uint
 * is a refusal rather than a silent zero.
 */
export function checkListingOrder(opts: {
  run: Pick<OrderRun, 'wallet' | 'contract' | 'size'>
  message: Record<string, unknown>
  tokenId: bigint
  total: bigint
  counter: bigint
  seaport: SeaportDeployment
}): { components: SeaportOrderComponents } | { error: string } {
  const { run, message, tokenId, total, counter, seaport } = opts

  if (!sameAddress(message['offerer'], run.wallet)) {
    return {
      error: `Refusing to sign: the order is offered by ${String(message['offerer'])}, not your wallet`,
    }
  }

  const offer = message['offer']
  if (!Array.isArray(offer) || offer.length !== 1) {
    return {
      error: 'Refusing to sign: the order does not offer exactly one item',
    }
  }
  const offered = offer[0] as Record<string, unknown>
  const offeredType = Number(toUint(offered['itemType']) ?? -1n)
  if (offeredType !== ITEM_TYPE.ERC721 && offeredType !== ITEM_TYPE.ERC1155) {
    return { error: 'Refusing to sign: the order does not offer an NFT' }
  }
  if (!sameAddress(offered['token'], run.contract)) {
    return {
      error: `Refusing to sign: the order offers ${String(offered['token'])}, not ${run.contract}`,
    }
  }
  const offeredId = toUint(offered['identifierOrCriteria'])
  if (offeredId === null || offeredId !== tokenId) {
    return {
      error: `Refusing to sign: the order offers token #${String(offered['identifierOrCriteria'])}, not #${tokenId}`,
    }
  }
  const offeredStart = toUint(offered['startAmount'])
  const offeredEnd = toUint(offered['endAmount'])
  if (
    offeredStart === null ||
    offeredEnd === null ||
    offeredStart !== BigInt(run.size) ||
    offeredEnd !== BigInt(run.size)
  ) {
    return {
      error: `Refusing to sign: the order offers a different quantity than ${run.size}`,
    }
  }

  const totals = considerationTotals(message['consideration'])
  if (!totals) {
    return {
      error: 'Refusing to sign: the order has no readable consideration',
    }
  }
  if (totals.hasNonNative) {
    return {
      error:
        'Refusing to sign: the order is priced in a token rather than native currency',
    }
  }
  if (totals.isDeclining) {
    return {
      error:
        'Refusing to sign: the order is a declining-price listing, which this ticket did not ask for',
    }
  }
  const floor = (total * BigInt(10_000 - PRICE_TOLERANCE_BPS)) / 10_000n
  const ceiling = (total * BigInt(10_000 + PRICE_TOLERANCE_BPS)) / 10_000n
  if (totals.native < floor || totals.native > ceiling) {
    return {
      error: `Refusing to sign: the order prices the item at ${totals.native} wei, not the ${total} wei you asked for`,
    }
  }

  // Rebuild the consideration rather than pass it through, and confirm the
  // seller is paid something out of it. An order whose every recipient is
  // somebody else is a valid Seaport order and a total loss.
  const consideration: Array<SeaportConsiderationItem> = []
  let toSeller = 0n
  for (const raw of message['consideration'] as Array<unknown>) {
    const item = raw as Record<string, unknown>
    const recipient = item['recipient']
    const startAmount = toUint(item['startAmount'])
    const endAmount = toUint(item['endAmount'])
    const identifier = toUint(item['identifierOrCriteria'])
    const itemType = toUint(item['itemType'])
    if (
      !isEvmAddress(recipient) ||
      startAmount === null ||
      endAmount === null ||
      identifier === null ||
      itemType === null
    ) {
      return { error: 'Refusing to sign: a consideration item is malformed' }
    }
    if (sameAddress(recipient, run.wallet)) toSeller += startAmount
    consideration.push({
      itemType: Number(itemType),
      token: isEvmAddress(item['token']) ? item['token'] : ZERO_ADDRESS,
      identifierOrCriteria: identifier,
      startAmount,
      endAmount,
      recipient,
    })
  }
  if (toSeller <= 0n) {
    return {
      error: 'Refusing to sign: the order pays the seller nothing',
    }
  }

  const startTime = toUint(message['startTime'])
  const endTime = toUint(message['endTime'])
  if (startTime === null || endTime === null || endTime <= startTime) {
    return {
      error: 'Refusing to sign: the order has no usable validity window',
    }
  }
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (startTime > now + BigInt(START_TIME_SLACK_SECONDS)) {
    return { error: 'Refusing to sign: the order starts in the future' }
  }
  if (endTime <= now) {
    return { error: 'Refusing to sign: the order is already expired' }
  }

  const messageCounter = toUint(message['counter'])
  if (messageCounter === null || messageCounter !== counter) {
    return {
      error: `Refusing to sign: the order carries counter ${String(message['counter'])}, but the chain reports ${counter}. A stale counter would sign an order that can never be filled.`,
    }
  }

  const salt = toUint(message['salt'])
  if (salt === null) return { error: 'Refusing to sign: the order has no salt' }
  const zoneHash = isBytes32(message['zoneHash'])
    ? message['zoneHash']
    : (`0x${'0'.repeat(64)}` as const)
  const zone = isEvmAddress(message['zone']) ? message['zone'] : ZERO_ADDRESS
  const conduitKey = message['conduitKey']
  if (!isBytes32(conduitKey)) {
    return { error: 'Refusing to sign: the order has no conduit key' }
  }
  if (!operatorForConduitKey(conduitKey, seaport)) {
    return {
      error:
        'Refusing to sign: the order routes through a conduit this connector does not recognise',
    }
  }
  const orderType = toUint(message['orderType'])
  if (orderType === null || Number(orderType) > ORDER_TYPE.PARTIAL_RESTRICTED) {
    return { error: 'Refusing to sign: the order has an unknown order type' }
  }

  return {
    components: {
      offerer: run.wallet,
      zone,
      offer: [
        {
          itemType: offeredType,
          token: run.contract,
          identifierOrCriteria: tokenId,
          startAmount: offeredStart,
          endAmount: offeredEnd,
        },
      ],
      consideration,
      orderType: Number(orderType),
      startTime,
      endTime,
      zoneHash,
      salt,
      conduitKey,
      counter,
    },
  }
}

/**
 * Find the order inside an actions response, without trusting its shape.
 *
 * `steps[]` is proto3 JSON, so default values are omitted and the discriminator
 * is a key rather than a field. Rather than guess at the envelope, this walks
 * the response for the one object that IS a Seaport order (offerer + offer +
 * consideration + conduitKey + counter) and lets `checkListingOrder` decide
 * whether it is the right one. A response with no such object is a refusal.
 */
export function findOrderComponents(
  response: unknown,
):
  | { message: Record<string, unknown>; protocolAddress: string | null }
  | { error: string } {
  const seen = new Set<unknown>()
  let protocolAddress: string | null = null

  const isOrder = (value: Record<string, unknown>) =>
    'offerer' in value &&
    'offer' in value &&
    'consideration' in value &&
    'conduitKey' in value &&
    'counter' in value

  const walk = (
    value: unknown,
    depth: number,
  ): Record<string, unknown> | null => {
    if (depth > 8 || !value || typeof value !== 'object') return null
    if (seen.has(value)) return null
    seen.add(value)
    if (Array.isArray(value)) {
      for (const entry of value) {
        const hit = walk(entry, depth + 1)
        if (hit) return hit
      }
      return null
    }
    const record = value as Record<string, unknown>
    if (protocolAddress === null) {
      const candidate = record['protocol_address'] ?? record['protocolAddress']
      if (typeof candidate === 'string') protocolAddress = candidate
    }
    if (isOrder(record)) return record
    for (const entry of Object.values(record)) {
      const hit = walk(entry, depth + 1)
      if (hit) return hit
    }
    return null
  }

  const message = walk(response, 0)
  if (!message) {
    return {
      error:
        'OpenSea returned no order to sign. Nothing was signed and nothing was sent.',
    }
  }
  return { message, protocolAddress }
}

// ── Intent 4: sell + market, accept the best standing offer ────────────

/**
 * Sell one owned token into the best collection offer.
 *
 * `price`, when the caller sets it, is a FLOOR: the best bid is still the best
 * bid, but a market sell with no bound at all is a footgun on an illiquid
 * collection, and the ticket can always pass one.
 */
async function acceptBestOffer(run: OrderRun): Promise<NftOrderResult> {
  const tokenId = run.tokenId
  if (tokenId === null) return fail('Selling needs the token id of the item')
  if (run.size !== 1) {
    return fail(
      'Accepting an offer sells one token at a time. Place one order per item.',
    )
  }

  const raw = await run.ctx.request<unknown>(
    `/offers/collection/${encodeURIComponent(run.ctx.slug)}/all?limit=20`,
  )
  const offers = asOfferArray(raw)
  const best = pickBestOffer(run, offers, tokenId)
  if ('error' in best) return fail(best.error)

  if (run.priceWei !== null && best.proceeds < run.priceWei) {
    return fail(
      'Refusing to sell: the best standing offer is below the floor you set',
    )
  }

  const bundle = await viemFor(run)
  const ownership = await assertHolding(run, bundle, tokenId)
  if (ownership) return fail(ownership)

  const response = await run.ctx.request<Record<string, unknown>>(
    '/offers/fulfillment_data',
    {
      method: 'POST',
      body: {
        offer: {
          hash: best.hash,
          chain: run.chainSlug,
          protocol_address: best.seaport.address,
        },
        fulfiller: { address: run.wallet },
        consideration: {
          asset_contract_address: run.contract,
          token_id: tokenId.toString(),
        },
      },
    },
  )
  // Accepting a bid moves WETH toward the seller, so the transaction carries no
  // value at all. Computing it locally here means a response that asks for one
  // is a refusal rather than a surprise debit.
  const built = await encodeFulfilment(run, bundle, response, best.seaport, 0n)
  if ('error' in built) return fail(built.error)

  const operator = operatorForConduitKey(OPENSEA_CONDUIT_KEY, best.seaport)
  if (!operator) return fail('No known operator for the OpenSea conduit')
  const conduitError = await assertConduit(bundle, operator, best.seaport)
  if (conduitError) return fail(conduitError)

  const approved = await bundle.publicClient.readContract({
    address: run.contract,
    abi: NFT_ABI,
    functionName: 'isApprovedForAll',
    args: [run.wallet, operator],
  })

  const signer = await signerFor(run, bundle)
  if (!signer.ok) return fail(signer.error)

  if (!approved) {
    const approveHash = await signer.walletClient.writeContract({
      address: run.contract,
      abi: NFT_ABI,
      functionName: 'setApprovalForAll',
      args: [operator, true],
    })
    const receipt = await bundle.publicClient.waitForTransactionReceipt({
      hash: approveHash,
    })
    if (receipt.status !== 'success') {
      return fail('The collection approval failed, so nothing was sold')
    }
  }

  const hash = await signer.walletClient.sendTransaction({
    to: built.call.to,
    data: built.call.data,
    value: built.call.value,
  })
  const receipt = await bundle.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    return fail(`The sale reverted on-chain (tx ${hash})`)
  }
  return { success: true, orderId: hash }
}

type CheckedOffer = {
  hash: string
  seaport: SeaportDeployment
  /** WETH the seller receives, before the fees deducted inside the order. */
  proceeds: bigint
}

/**
 * The best bid this token can actually be sold into.
 *
 * A trait offer is skipped rather than attempted: its criteria root names a
 * subset nobody can reproduce client-side, so there is no way to confirm the
 * token qualifies before signing away the approval.
 */
export function pickBestOffer(
  run: Pick<OrderRun, 'contract' | 'chainSlug'>,
  offers: Array<Record<string, unknown>>,
  tokenId: bigint,
): CheckedOffer | { error: string } {
  let best: CheckedOffer | null = null
  for (const offer of offers) {
    const hash = offer['order_hash']
    if (typeof hash !== 'string') continue
    const chain = offer['chain']
    if (typeof chain === 'string' && chain !== run.chainSlug) continue
    const status = offer['status']
    if (typeof status === 'string' && status.toUpperCase() !== 'ACTIVE')
      continue
    const remaining = toUint(offer['remaining_quantity'])
    if (remaining !== null && remaining < 1n) continue

    const seaport = resolveSeaport(offer['protocol_address'])
    if (!seaport) continue

    const criteria = offer['criteria']
    if (!criteria || typeof criteria !== 'object') continue
    const criteriaRecord = criteria as Record<string, unknown>
    const contractRecord = criteriaRecord['contract']
    const contractAddress =
      contractRecord && typeof contractRecord === 'object'
        ? (contractRecord as Record<string, unknown>)['address']
        : undefined
    if (!sameAddress(contractAddress, run.contract)) continue
    if (criteriaRecord['traits'] || criteriaRecord['numeric_traits']) continue
    const encoded = criteriaRecord['encoded_token_ids']
    if (
      encoded !== undefined &&
      encoded !== null &&
      encoded !== '*' &&
      !(typeof encoded === 'string' && encodedCovers(encoded, tokenId))
    ) {
      continue
    }

    const protocolData = offer['protocol_data']
    const parameters =
      protocolData && typeof protocolData === 'object'
        ? (protocolData as Record<string, unknown>)['parameters']
        : undefined
    if (!parameters || typeof parameters !== 'object') continue
    const offerItems = (parameters as Record<string, unknown>)['offer']
    if (!Array.isArray(offerItems) || offerItems.length !== 1) continue
    const item = offerItems[0] as Record<string, unknown>
    if (Number(toUint(item['itemType']) ?? -1n) !== ITEM_TYPE.ERC20) continue
    const proceeds = toUint(item['startAmount'])
    if (proceeds === null || proceeds <= 0n) continue

    if (!best || proceeds > best.proceeds) {
      best = { hash, seaport, proceeds }
    }
  }
  if (!best) {
    return {
      error:
        'No standing collection offer on OpenSea covers this token right now',
    }
  }
  return best
}

/**
 * Whether a comma-and-range token id list covers the token.
 *
 * OpenSea encodes an explicit id set as `1,5,9-12`. `*` is the whole
 * collection and is handled by the caller; anything this cannot parse is
 * treated as not covering, which keeps the failure on the safe side.
 */
export function encodedCovers(encoded: string, tokenId: bigint): boolean {
  for (const part of encoded.split(',')) {
    const piece = part.trim()
    if (piece.length === 0) continue
    const range = piece.split('-')
    if (range.length === 1) {
      const one = toUint(range[0])
      if (one !== null && one === tokenId) return true
      continue
    }
    if (range.length === 2) {
      const low = toUint(range[0])
      const high = toUint(range[1])
      if (low !== null && high !== null && tokenId >= low && tokenId <= high) {
        return true
      }
    }
  }
  return false
}

// ── Shared reads ───────────────────────────────────────────────────────

/**
 * The wallet holds the token, confirmed on-chain.
 *
 * ERC-721 first, then the ERC-1155 balance, because a collection does not
 * announce which standard it is and OpenSea lists both. A null return means the
 * check passed; a string is the refusal.
 */
async function assertHolding(
  run: OrderRun,
  bundle: ViemBundle,
  tokenId: bigint,
): Promise<string | null> {
  try {
    const owner = await bundle.publicClient.readContract({
      address: run.contract,
      abi: NFT_ABI,
      functionName: 'ownerOf',
      args: [tokenId],
    })
    return sameAddress(owner, run.wallet)
      ? null
      : `Token #${tokenId} is not held by this wallet. Refusing to sign.`
  } catch {
    // Not an ERC-721, or the id does not exist. Try the multi-token read before
    // concluding anything.
  }
  try {
    const balance = await bundle.publicClient.readContract({
      address: run.contract,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [run.wallet, tokenId],
    })
    return balance >= BigInt(run.size)
      ? null
      : `This wallet holds ${balance} of token #${tokenId}, fewer than the ${run.size} being sold. Refusing to sign.`
  } catch (err) {
    return `Ownership of token #${tokenId} could not be confirmed (${describe(err, 'read failed')}). Refusing to sign.`
  }
}

// ── Response shaping ───────────────────────────────────────────────────

function asListingArray(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  const list = record['listings']
  if (Array.isArray(list)) {
    return list.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object',
    )
  }
  return 'order_hash' in record ? [record] : []
}

function asOfferArray(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  const list = record['offers']
  if (Array.isArray(list)) {
    return list.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object',
    )
  }
  return 'order_hash' in record ? [record] : []
}
