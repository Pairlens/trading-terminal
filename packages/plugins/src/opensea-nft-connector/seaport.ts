// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Everything about Seaport that this connector PINS, plus the pure helpers that
 * turn an untrusted OpenSea response into something a signer may look at.
 *
 * Nothing in this file makes a network call and nothing in it holds a key. That
 * is deliberate: `trading.ts` is the only module that signs, and every constant
 * it checks against has to be reviewable without reading the signing path.
 *
 * ## Provenance of every pinned address
 *
 * All four were confirmed by an `eth_call` against the deployment itself, on
 * BOTH tradable chains, rather than copied from a document:
 *
 *   - `Seaport.information()` returns `(version, domainSeparator, conduitController)`.
 *     `0x0000000000000068F116a894984e2DB1123eB395` answers `1.6` and
 *     `0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC` answers `1.5`, both naming
 *     `0x00000000F9490004C11Cef243f5400493c00Ad63` as their conduit controller.
 *     Seaport is deployed by CREATE2, so the address is identical on Ethereum
 *     and Base, which the same call confirmed on each.
 *   - `ConduitController.getConduit(OPENSEA_CONDUIT_KEY)` returns
 *     `(0x1E0049783F008A0085193E00003D00cd54003c71, true)` on both chains. The
 *     conduit key itself was read out of a live OpenSea collection offer, so the
 *     key is OpenSea's and the address is the chain's answer for that key, not a
 *     transcription.
 *   - WETH: `symbol()`/`decimals()` on each address returned `WETH`/`18`.
 *
 * The signing path re-runs the conduit check at run time anyway (`getConduit`
 * before any approval is granted), for the same reason `lp-writer` re-reads a
 * manager's `factory()`: a hardcoded address is a claim, and only the chain can
 * confirm it. A stale table must fail closed rather than get approved.
 *
 * ## What is NOT pinned, and why that is survivable
 *
 * The calldata OpenSea hands back for a fill is not reproducible client-side,
 * so it is passed through. The exposure that leaves is small and bounded, for
 * the same reason `swap-executor` accepts router calldata it cannot decode:
 * Seaport verifies the maker's own signature over the order before it moves
 * anything, so calldata that does not correspond to a real signed order simply
 * reverts. What a caller CAN steer is the target, the value, the recipient and
 * the criteria resolvers, and all four are decided here instead: the target must
 * be a pinned Seaport, the value is summed from the listing's own consideration,
 * the recipient is forced to the signer, and every resolver's identifier is
 * forced to the token the caller chose.
 */
import type { NftChain } from '@pairlens/shared/nft-types'

// ── Pinned deployments ─────────────────────────────────────────────────

export type SeaportDeployment = {
  address: `0x${string}`
  /** The EIP-712 domain version. Read from the contract's `information()`. */
  version: string
}

/**
 * The Seaport versions this connector will sign against or send to, keyed by
 * lowercase address so an API response can be looked up directly.
 *
 * 1.6 is what OpenSea issues today; 1.5 is here because orders signed before
 * the migration are still fillable and refusing them would look like a broken
 * book rather than a policy. Older majors (1.4, 1.1) are deployed and answer
 * `information()`, and are deliberately left OUT: nothing OpenSea's API returns
 * today points at them, and an allowlist is only worth having if it is the
 * shortest one that works.
 */
export const SEAPORT_DEPLOYMENTS: Readonly<Record<string, SeaportDeployment>> =
  {
    '0x0000000000000068f116a894984e2db1123eb395': {
      address: '0x0000000000000068F116a894984e2DB1123eB395',
      version: '1.6',
    },
    '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': {
      address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
      version: '1.5',
    },
  }

/** The version a freshly built order is signed against. */
export const DEFAULT_SEAPORT: SeaportDeployment =
  SEAPORT_DEPLOYMENTS['0x0000000000000068f116a894984e2db1123eb395']

/** Resolve an API-supplied protocol address, or null if it is not pinned. */
export function resolveSeaport(address: unknown): SeaportDeployment | null {
  if (typeof address !== 'string') return null
  return SEAPORT_DEPLOYMENTS[address.toLowerCase()] ?? null
}

/**
 * OpenSea's conduit key, read from a live collection offer's `conduitKey`.
 *
 * A conduit is the contract that actually pulls the token, so this key decides
 * where `setApprovalForAll` and the WETH allowance point. It is never taken from
 * a response.
 */
export const OPENSEA_CONDUIT_KEY =
  '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000' as const

/** `ConduitController.getConduit(OPENSEA_CONDUIT_KEY)`, confirmed on-chain. */
export const OPENSEA_CONDUIT =
  '0x1E0049783F008A0085193E00003D00cd54003c71' as const

/** Named by every pinned Seaport's own `information()`. */
export const CONDUIT_CONTROLLER =
  '0x00000000F9490004C11Cef243f5400493c00Ad63' as const

/** A conduit key of all zeroes means Seaport itself is the operator. */
export const NULL_CONDUIT_KEY = `0x${'0'.repeat(64)}` as const

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

/**
 * Whichever contract must hold the approval for a given conduit key.
 *
 * Only two answers are allowed. An unknown key means the fill would pull the
 * asset through a contract nobody here has vetted, so it is refused rather than
 * approved.
 */
export function operatorForConduitKey(
  conduitKey: unknown,
  seaport: SeaportDeployment,
): `0x${string}` | null {
  if (typeof conduitKey !== 'string') return null
  const key = conduitKey.toLowerCase()
  if (key === OPENSEA_CONDUIT_KEY.toLowerCase()) return OPENSEA_CONDUIT
  if (key === NULL_CONDUIT_KEY) return seaport.address
  return null
}

// ── Per-chain constants for the two chains that can sign ───────────────

/**
 * The public JSON-RPC each tradable chain is read through.
 *
 * Same endpoints the EVM DEX connector uses, and chosen for the same reason:
 * they answer CORS, so the hosted web terminal and the desktop webview take one
 * path. These are reads and a broadcast, never a place a key goes.
 */
export const TRADING_RPC: Readonly<Partial<Record<NftChain, string>>> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
}

/**
 * The ERC-20 an offer is denominated in.
 *
 * Seaport cannot hold a bid in native currency (an offer has to be pullable at
 * fill time), so every collection offer is WETH. Both addresses answered
 * `symbol()` = `WETH`, `decimals()` = 18.
 */
export const WRAPPED_NATIVE: Readonly<
  Partial<Record<NftChain, `0x${string}`>>
> = {
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  base: '0x4200000000000000000000000000000000000006',
}

// ── Seaport enums, as the protocol numbers them ────────────────────────

export const ITEM_TYPE = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5,
} as const

export const ORDER_TYPE = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
} as const

// ── ABIs ───────────────────────────────────────────────────────────────

export const CONDUIT_CONTROLLER_ABI = [
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
] as const

export const SEAPORT_READ_ABI = [
  {
    type: 'function',
    name: 'getCounter',
    stateMutability: 'view',
    inputs: [{ name: 'offerer', type: 'address' }],
    outputs: [{ name: 'counter', type: 'uint256' }],
  },
] as const

/**
 * The token-side reads and the one approval a listing or an offer acceptance
 * needs.
 *
 * `ownerOf` is ERC-721 and `balanceOf(address,uint256)` is ERC-1155; the writer
 * tries the first and falls back to the second, because OpenSea lists both and
 * a collection does not announce which it is. `setApprovalForAll` is identical
 * in both standards, which is why one ABI serves.
 */
export const NFT_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const

/**
 * The fill entry points OpenSea's `fulfillment_data` is allowed to name.
 *
 * Written out with NAMED components on purpose. OpenSea returns `input_data` as
 * a JSON object keyed by Solidity parameter name, and a named ABI is what lets
 * viem encode that object without anybody guessing at positional order. A
 * response naming any other function is refused rather than encoded, which is
 * the same fail-closed shape as `swap-executor`'s router allowlist: the point of
 * an allowlist is that the unknown case has one answer.
 */
export const SEAPORT_FULFILL_ABI = [
  {
    type: 'function',
    name: 'fulfillBasicOrder_efficient_6GL6yc',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'parameters',
        type: 'tuple',
        components: [
          { name: 'considerationToken', type: 'address' },
          { name: 'considerationIdentifier', type: 'uint256' },
          { name: 'considerationAmount', type: 'uint256' },
          { name: 'offerer', type: 'address' },
          { name: 'zone', type: 'address' },
          { name: 'offerToken', type: 'address' },
          { name: 'offerIdentifier', type: 'uint256' },
          { name: 'offerAmount', type: 'uint256' },
          { name: 'basicOrderType', type: 'uint8' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'zoneHash', type: 'bytes32' },
          { name: 'salt', type: 'uint256' },
          { name: 'offererConduitKey', type: 'bytes32' },
          { name: 'fulfillerConduitKey', type: 'bytes32' },
          { name: 'totalOriginalAdditionalRecipients', type: 'uint256' },
          {
            name: 'additionalRecipients',
            type: 'tuple[]',
            components: [
              { name: 'amount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
            ],
          },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'fulfilled', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'fulfillBasicOrder',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'parameters',
        type: 'tuple',
        components: [
          { name: 'considerationToken', type: 'address' },
          { name: 'considerationIdentifier', type: 'uint256' },
          { name: 'considerationAmount', type: 'uint256' },
          { name: 'offerer', type: 'address' },
          { name: 'zone', type: 'address' },
          { name: 'offerToken', type: 'address' },
          { name: 'offerIdentifier', type: 'uint256' },
          { name: 'offerAmount', type: 'uint256' },
          { name: 'basicOrderType', type: 'uint8' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'zoneHash', type: 'bytes32' },
          { name: 'salt', type: 'uint256' },
          { name: 'offererConduitKey', type: 'bytes32' },
          { name: 'fulfillerConduitKey', type: 'bytes32' },
          { name: 'totalOriginalAdditionalRecipients', type: 'uint256' },
          {
            name: 'additionalRecipients',
            type: 'tuple[]',
            components: [
              { name: 'amount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
            ],
          },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'fulfilled', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'fulfillOrder',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          {
            name: 'parameters',
            type: 'tuple',
            components: [
              { name: 'offerer', type: 'address' },
              { name: 'zone', type: 'address' },
              {
                name: 'offer',
                type: 'tuple[]',
                components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' },
                ],
              },
              {
                name: 'consideration',
                type: 'tuple[]',
                components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' },
                  { name: 'recipient', type: 'address' },
                ],
              },
              { name: 'orderType', type: 'uint8' },
              { name: 'startTime', type: 'uint256' },
              { name: 'endTime', type: 'uint256' },
              { name: 'zoneHash', type: 'bytes32' },
              { name: 'salt', type: 'uint256' },
              { name: 'conduitKey', type: 'bytes32' },
              {
                name: 'totalOriginalConsiderationItems',
                type: 'uint256',
              },
            ],
          },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'fulfillerConduitKey', type: 'bytes32' },
    ],
    outputs: [{ name: 'fulfilled', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'fulfillAdvancedOrder',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'advancedOrder',
        type: 'tuple',
        components: [
          {
            name: 'parameters',
            type: 'tuple',
            components: [
              { name: 'offerer', type: 'address' },
              { name: 'zone', type: 'address' },
              {
                name: 'offer',
                type: 'tuple[]',
                components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' },
                ],
              },
              {
                name: 'consideration',
                type: 'tuple[]',
                components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' },
                  { name: 'recipient', type: 'address' },
                ],
              },
              { name: 'orderType', type: 'uint8' },
              { name: 'startTime', type: 'uint256' },
              { name: 'endTime', type: 'uint256' },
              { name: 'zoneHash', type: 'bytes32' },
              { name: 'salt', type: 'uint256' },
              { name: 'conduitKey', type: 'bytes32' },
              {
                name: 'totalOriginalConsiderationItems',
                type: 'uint256',
              },
            ],
          },
          { name: 'numerator', type: 'uint120' },
          { name: 'denominator', type: 'uint120' },
          { name: 'signature', type: 'bytes' },
          { name: 'extraData', type: 'bytes' },
        ],
      },
      {
        name: 'criteriaResolvers',
        type: 'tuple[]',
        components: [
          { name: 'orderIndex', type: 'uint256' },
          { name: 'side', type: 'uint8' },
          { name: 'index', type: 'uint256' },
          { name: 'identifier', type: 'uint256' },
          { name: 'criteriaProof', type: 'bytes32[]' },
        ],
      },
      { name: 'fulfillerConduitKey', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'fulfilled', type: 'bool' }],
  },
] as const

/**
 * Argument order per allowed function, so `input_data`'s object keys never
 * decide it.
 *
 * `Object.values()` on a parsed JSON object would work right up until OpenSea
 * reorders a field, at which point the arguments shift silently and the encoded
 * call means something else. Naming them here makes that a refusal.
 */
export const FULFILL_ARG_NAMES: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  fulfillBasicOrder_efficient_6GL6yc: ['parameters'],
  fulfillBasicOrder: ['parameters'],
  fulfillOrder: ['order', 'fulfillerConduitKey'],
  fulfillAdvancedOrder: [
    'advancedOrder',
    'criteriaResolvers',
    'fulfillerConduitKey',
    'recipient',
  ],
}

// ── EIP-712 ────────────────────────────────────────────────────────────

/**
 * Seaport's order struct, as the protocol hashes it.
 *
 * Pinned here rather than read from whatever typed-data envelope OpenSea
 * returns. A signature is only as good as the types it was taken over, so the
 * response supplies the message fields (each validated) and never the schema.
 */
export const SEAPORT_EIP712_TYPES = {
  OrderComponents: [
    { name: 'offerer', type: 'address' },
    { name: 'zone', type: 'address' },
    { name: 'offer', type: 'OfferItem[]' },
    { name: 'consideration', type: 'ConsiderationItem[]' },
    { name: 'orderType', type: 'uint8' },
    { name: 'startTime', type: 'uint256' },
    { name: 'endTime', type: 'uint256' },
    { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
    { name: 'conduitKey', type: 'bytes32' },
    { name: 'counter', type: 'uint256' },
  ],
  OfferItem: [
    { name: 'itemType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'identifierOrCriteria', type: 'uint256' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'endAmount', type: 'uint256' },
  ],
  ConsiderationItem: [
    { name: 'itemType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'identifierOrCriteria', type: 'uint256' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'endAmount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
  ],
} as const

export function seaportDomain(seaport: SeaportDeployment, chainId: number) {
  return {
    name: 'Seaport',
    version: seaport.version,
    chainId,
    verifyingContract: seaport.address,
  } as const
}

// ── Order shapes we build or validate ──────────────────────────────────

export type SeaportOfferItem = {
  itemType: number
  token: `0x${string}`
  identifierOrCriteria: bigint
  startAmount: bigint
  endAmount: bigint
}

export type SeaportConsiderationItem = SeaportOfferItem & {
  recipient: `0x${string}`
}

export type SeaportOrderComponents = {
  offerer: `0x${string}`
  zone: `0x${string}`
  offer: Array<SeaportOfferItem>
  consideration: Array<SeaportConsiderationItem>
  orderType: number
  startTime: bigint
  endTime: bigint
  zoneHash: `0x${string}`
  salt: bigint
  conduitKey: `0x${string}`
  counter: bigint
}

// ── Pure helpers ───────────────────────────────────────────────────────

export function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function isBytes32(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

export function sameAddress(a: unknown, b: unknown): boolean {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.toLowerCase() === b.toLowerCase()
  )
}

/**
 * Read a uint out of JSON without letting a float eat the low bits.
 *
 * OpenSea serialises some amounts as JSON numbers, and 0.1 ETH in wei is far
 * past `Number.MAX_SAFE_INTEGER`, so a naive `BigInt(n)` on a parsed number is
 * quietly wrong in exactly the digits that matter. A number that cannot be
 * represented exactly is refused rather than rounded.
 */
export function toUint(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(trimmed)) return null
    try {
      return BigInt(trimmed)
    } catch {
      return null
    }
  }
  return null
}

/**
 * A human decimal amount as wei, without ever going through a float.
 *
 * `parseUnits` wants a decimal STRING, and `Number.prototype.toString` emits
 * exponent notation outside a middling range, so a very small price would arrive
 * as `1e-7` and be rejected (or worse, misread). Anything that cannot be written
 * plainly at 18 decimals is refused here instead.
 */
export function decimalToWei(amount: number, decimals = 18): bigint | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (amount >= 1e21) return null
  const fixed = amount.toFixed(decimals)
  const [whole, fraction = ''] = fixed.split('.')
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals)
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0')
  } catch {
    return null
  }
}

export type ConsiderationTotals = {
  /** Native currency the fulfiller must send. This is the `value`. */
  native: bigint
  /** True when any consideration item is not native currency. */
  hasNonNative: boolean
  /** True when any item's price moves with time (a declining auction). */
  isDeclining: boolean
}

/**
 * Sum what a listing costs, from the listing's own signed parameters.
 *
 * This is where `value` comes from, and it is the whole reason the `value` in
 * OpenSea's fulfilment response is never used: the consideration is covered by
 * the maker's signature, so summing it is reading the order, whereas trusting
 * the response is trusting the messenger.
 */
export function considerationTotals(
  consideration: unknown,
): ConsiderationTotals | null {
  if (!Array.isArray(consideration) || consideration.length === 0) return null
  let native = 0n
  let hasNonNative = false
  let isDeclining = false
  for (const raw of consideration) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    const itemType = toUint(item['itemType'])
    const start = toUint(item['startAmount'])
    const end = toUint(item['endAmount'])
    if (itemType === null || start === null || end === null) return null
    if (start !== end) isDeclining = true
    if (Number(itemType) === ITEM_TYPE.NATIVE) native += start
    else hasNonNative = true
  }
  return { native, hasNonNative, isDeclining }
}

export type FulfillPlan = {
  functionName: string
  args: ReadonlyArray<unknown>
}

/** One entry of `fulfillAdvancedOrder`'s `criteriaResolvers` argument. */
export type CriteriaResolver = {
  orderIndex: bigint
  side: number
  index: bigint
  identifier: bigint
  criteriaProof: ReadonlyArray<`0x${string}`>
}

/**
 * Rebuild the criteria resolvers around the token the caller chose.
 *
 * A resolver is what tells Seaport WHICH token a criteria item resolves to, and
 * a collection offer's criteria root is 0, which makes Seaport skip proof
 * verification entirely and accept any identifier handed to it. So a response
 * that returns a resolver naming a different token in the same collection is
 * asking to sell a different NFT for the same money, and every other check in
 * the connector would still pass. The identifier is therefore ours, never
 * theirs: it must equal the token the caller named, and what gets encoded is the
 * local bigint rather than the value that arrived.
 */
export function anchorCriteriaResolvers(
  value: unknown,
  identifier: bigint | null,
): { resolvers: Array<CriteriaResolver> } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: 'Refusing to send: the fulfilment criteria are unreadable' }
  }
  if (value.length === 0) return { resolvers: [] }
  if (identifier === null) {
    return {
      error:
        'Refusing to send: the fulfilment resolves a criteria item, but this order names no token to anchor it to',
    }
  }
  const resolvers: Array<CriteriaResolver> = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'Refusing to send: a criteria resolver is malformed' }
    }
    const entry = raw as Record<string, unknown>
    const named = toUint(entry['identifier'])
    if (named === null || named !== identifier) {
      return {
        error: `Refusing to send: the fulfilment resolves to token #${String(entry['identifier'])}, not the #${identifier} you chose`,
      }
    }
    const orderIndex = toUint(entry['orderIndex'])
    const index = toUint(entry['index'])
    const side = toUint(entry['side'])
    if (orderIndex === null || index === null || side === null) {
      return { error: 'Refusing to send: a criteria resolver is malformed' }
    }
    const proofRaw = entry['criteriaProof']
    const proof: Array<`0x${string}`> = []
    if (proofRaw !== undefined && proofRaw !== null) {
      if (!Array.isArray(proofRaw)) {
        return {
          error: 'Refusing to send: a criteria proof is not a list of hashes',
        }
      }
      for (const node of proofRaw) {
        if (!isBytes32(node)) {
          return {
            error: 'Refusing to send: a criteria proof carries a non-hash node',
          }
        }
        proof.push(node)
      }
    }
    resolvers.push({
      orderIndex,
      side: Number(side),
      index,
      // The token the caller chose, re-encoded from our own bigint.
      identifier,
      criteriaProof: proof,
    })
  }
  return { resolvers }
}

/**
 * Turn a fulfilment response into an encodable call, or say why it will not be.
 *
 * The signature string is split on `(` exactly as OpenSea's own docs do, then
 * matched against the allowlist. `recipient` is overwritten with the signer,
 * `criteriaResolvers` is anchored to the token the caller chose, and
 * `fulfillerConduitKey` is checked against the two keys whose operator we know,
 * because those are the fields that decide which asset moves, where it lands
 * and who is allowed to move it.
 */
export function planFulfillCall(opts: {
  functionSignature: unknown
  inputData: unknown
  seaport: SeaportDeployment
  fulfiller: `0x${string}`
  /** The token this order is about, or null when it names no single token. */
  identifier: bigint | null
}): { plan: FulfillPlan; operator: `0x${string}` } | { error: string } {
  const { functionSignature, inputData, seaport, fulfiller, identifier } = opts
  if (typeof functionSignature !== 'string' || functionSignature.length === 0) {
    return { error: 'OpenSea returned no fulfilment function' }
  }
  const functionName = functionSignature.split('(')[0]
  const argNames = FULFILL_ARG_NAMES[functionName]
  if (!argNames) {
    return {
      error: `Refusing to send: OpenSea named an unrecognised Seaport function '${functionName}'`,
    }
  }
  if (!inputData || typeof inputData !== 'object' || Array.isArray(inputData)) {
    return { error: 'OpenSea returned no fulfilment arguments' }
  }
  const input = inputData as Record<string, unknown>

  // The conduit key decides who pulls the asset, so it is resolved to a known
  // operator before anything is encoded. An unknown one is a refusal, not a
  // default: silently substituting the null key would change the meaning of the
  // call rather than fix it.
  let operator = seaport.address
  if ('fulfillerConduitKey' in input) {
    const resolved = operatorForConduitKey(
      input['fulfillerConduitKey'],
      seaport,
    )
    if (!resolved) {
      return {
        error:
          'Refusing to send: the fulfilment names a conduit this connector does not recognise',
      }
    }
    operator = resolved
  }

  const args: Array<unknown> = []
  for (const name of argNames) {
    if (name === 'recipient') {
      // Never the response's. The asset goes to the signer or nowhere.
      args.push(fulfiller)
      continue
    }
    if (!(name in input)) {
      return {
        error: `Refusing to send: the fulfilment is missing '${name}'`,
      }
    }
    if (name === 'criteriaResolvers') {
      const anchored = anchorCriteriaResolvers(input[name], identifier)
      if ('error' in anchored) return { error: anchored.error }
      args.push(anchored.resolvers)
      continue
    }
    args.push(input[name])
  }
  return { plan: { functionName, args }, operator }
}

/** 32 random bytes, for a fresh order's salt. */
export function randomSalt(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let out = 0n
  for (const byte of bytes) out = (out << 8n) | BigInt(byte)
  return out
}
