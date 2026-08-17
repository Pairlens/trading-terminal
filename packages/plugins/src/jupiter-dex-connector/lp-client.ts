// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A Solana wallet's concentrated-liquidity positions, read straight off the
 * chain.
 *
 * Jupiter is an aggregator and owns no liquidity, so there is no position
 * manager to ask. Orca and Raydium each keep a position in a program account
 * whose address is a PDA of the position NFT's mint, which turns the walk into
 * something a browser can afford:
 *
 *   1. `getTokenAccountsByOwner` on BOTH token programs (Orca mints new
 *      positions under Token-2022), keeping mints held with amount 1 and
 *      0 decimals — the position NFTs,
 *   2. derive `PDA(["position", mint])` under each program locally, no scan,
 *   3. `getMultipleAccounts` over those candidates; the ones that exist ARE the
 *      positions, and the account's owner program says which protocol,
 *   4. `getMultipleAccounts` for the distinct pools (price, tick, mints) and
 *      for Raydium's shared fee-rate configs,
 *   5. `getMultipleParsedAccounts` for the distinct token mints, which is where
 *      decimals come from,
 *   6. token symbols from the Jupiter registry, best effort.
 *
 * Six batched calls for a wallet of any size, and a wallet holding no NFTs
 * stops after the first two.
 *
 * READ ONLY, structurally. Nothing here takes a `getPrivateKey`, builds an
 * instruction or reaches a wallet slot; the owner is a parameter because an
 * address is public and the panes have it while the vault is still sealed.
 *
 * ── What the fee numbers mean, and why they are labelled ────────────────────
 *
 * The EVM client simulates a `collect` and reports what a claim would pay THIS
 * block. Neither Solana program offers that: fees are settled into
 * `feeOwed`/`tokenFeesOwed` when the position is next touched, and computing
 * the unsettled remainder means replaying the pool's fee growth across both
 * tick arrays — several more accounts per position and a second copy of the
 * protocol's arithmetic to get wrong. So these positions report the settled
 * figure and say so: `feesAsOf: 'last-touch'`, which both panes render as a
 * caption. A number that is a floor and is labelled a floor is useful; the same
 * number presented as live is a lie about money.
 */
import bs58 from 'bs58'

import {
  descaleAmount,
  feeTierFraction,
  isInRange,
  positionAmounts,
  sqrtPriceX96ToPrice,
  tickToPrice,
} from '../evm-dex-connector/lp-math'
import {
  ORCA_POSITION_SIZE,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  ORCA_WHIRLPOOL_SIZE,
  POSITION_PDA_SEED,
  PROTOCOL_LABEL,
  PROTOCOL_PROGRAM,
  RAYDIUM_CLMM_PROGRAM_ID,
  RAYDIUM_POOL_SIZE,
  RAYDIUM_POSITION_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeOrcaPosition,
  decodeOrcaWhirlpool,
  decodeRaydiumAmmConfigFee,
  decodeRaydiumPool,
  decodeRaydiumPosition,
  sqrtPriceX64ToX96,
} from './lp-layouts'
import { lookupTokenByMint, resolvePairMints } from './token-registry'
import type { SolanaLpProtocol } from './lp-layouts'
import type {
  LpPositionEntry,
  LpPositionToken,
  LpPositionsResponse,
} from '@pairlens/shared/instrument-types'

/**
 * NFTs inspected before anything is filtered.
 *
 * Generous for the same reason the EVM cap is: a closed position leaves its NFT
 * in the wallet until it is burned, and a wallet that has ever provided
 * liquidity accumulates them. Deriving a PDA is local arithmetic, so the only
 * cost of looking past the first handful is the batched account read.
 */
export const SOLANA_LP_ENUMERATION_CAP = 120

/** Live positions fully priced. The ceiling on pool and mint reads. */
export const SOLANA_LP_POSITION_CAP = 24

/** `getMultipleAccounts` accepts 100 addresses per call. */
const ACCOUNT_BATCH = 100

/** Fallback decimals for a mint whose account could not be read. */
const FALLBACK_DECIMALS = 9

/** Base58 alphabet, and the length band a 32-byte pubkey encodes into. */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** True for a syntactically plausible Solana address. Anything else refused. */
export function isSolanaLpAddress(value: unknown): value is string {
  return typeof value === 'string' && BASE58_RE.test(value)
}

/** One position, protocol-agnostic, before pool state is folded in. */
export type RawSolanaLpPosition = {
  protocol: SolanaLpProtocol
  /** The position NFT's mint — the identity a row is keyed on. */
  positionMint: string
  /** The PDA holding the state. Derivable from the mint; kept for links. */
  positionAddress: string
  pool: string
  liquidity: bigint
  tickLower: number
  tickUpper: number
  /** Settled fees in raw units, as of the position's last touch. */
  feesOwed0: bigint
  feesOwed1: bigint
}

/** Live pool state, converted to the v3 fixed-point the shared math expects. */
export type SolanaPoolState = {
  sqrtPriceX96: bigint
  tick: number
  mint0: string
  mint1: string
  /** Hundredths of a bip. Null while Raydium's config account is unresolved. */
  fee: number | null
}

/**
 * A position worth listing.
 *
 * Same rule as the EVM side: an NFT with no liquidity and nothing owed is a
 * receipt for a position that was closed, not a position.
 */
export function isListableSolanaPosition(position: {
  liquidity: bigint
  feesOwed0: bigint
  feesOwed1: bigint
}): boolean {
  return (
    position.liquidity > 0n ||
    position.feesOwed0 > 0n ||
    position.feesOwed1 > 0n
  )
}

/**
 * Does this position's pool hold exactly the pair on screen?
 *
 * Matched on MINTS, never on symbols, and case-sensitively: base58 is not a
 * case-insensitive encoding, and Solana tickers collide constantly. Null when
 * the caller gave no pair or a leg would not resolve, which the pane renders as
 * an unfiltered list rather than as "no positions on this pool".
 */
export function matchesSolanaPair(
  positionMints: readonly [string, string],
  pairMints: readonly [string, string] | null,
): boolean | null {
  if (!pairMints) return null
  const have = new Set(positionMints)
  return pairMints.every((mint) => have.has(mint))
}

/**
 * Decode an account that a position PDA resolved to.
 *
 * Keyed on the OWNER PROGRAM first and the size second. A PDA is only an
 * address: nothing stops another program from owning the account at it, and
 * decoding by size alone would read a stranger's bytes as a position.
 */
export function decodePositionAccount(opts: {
  positionMint: string
  positionAddress: string
  ownerProgram: string
  data: Uint8Array
}): RawSolanaLpPosition | null {
  const { positionMint, positionAddress, ownerProgram, data } = opts
  if (
    ownerProgram === ORCA_WHIRLPOOL_PROGRAM_ID &&
    data.length === ORCA_POSITION_SIZE
  ) {
    const decoded = decodeOrcaPosition(data)
    return {
      protocol: 'orca-whirlpool',
      positionMint,
      positionAddress,
      pool: bs58.encode(decoded.pool),
      liquidity: decoded.liquidity,
      tickLower: decoded.tickLower,
      tickUpper: decoded.tickUpper,
      feesOwed0: decoded.feeOwedA,
      feesOwed1: decoded.feeOwedB,
    }
  }
  if (
    ownerProgram === RAYDIUM_CLMM_PROGRAM_ID &&
    data.length === RAYDIUM_POSITION_SIZE
  ) {
    const decoded = decodeRaydiumPosition(data)
    return {
      protocol: 'raydium-clmm',
      positionMint,
      positionAddress,
      pool: bs58.encode(decoded.pool),
      liquidity: decoded.liquidity,
      tickLower: decoded.tickLower,
      tickUpper: decoded.tickUpper,
      feesOwed0: decoded.tokenFeesOwed0,
      feesOwed1: decoded.tokenFeesOwed1,
    }
  }
  return null
}

/** Decode a pool account of either protocol, or null when it is neither. */
export function decodePoolAccount(data: Uint8Array): {
  state: SolanaPoolState
  /** Raydium's fee-rate config account, which still has to be read. */
  ammConfig: string | null
} | null {
  if (data.length === ORCA_WHIRLPOOL_SIZE) {
    const pool = decodeOrcaWhirlpool(data)
    return {
      state: {
        sqrtPriceX96: sqrtPriceX64ToX96(pool.sqrtPriceX64),
        tick: pool.tickCurrent,
        mint0: bs58.encode(pool.mintA),
        mint1: bs58.encode(pool.mintB),
        // Orca keeps the rate on the pool, in the same unit Uniswap v3 uses.
        fee: pool.feeRate,
      },
      ammConfig: null,
    }
  }
  if (data.length === RAYDIUM_POOL_SIZE) {
    const pool = decodeRaydiumPool(data)
    return {
      state: {
        sqrtPriceX96: sqrtPriceX64ToX96(pool.sqrtPriceX64),
        tick: pool.tickCurrent,
        mint0: bs58.encode(pool.mint0),
        mint1: bs58.encode(pool.mint1),
        fee: null,
      },
      ammConfig: bs58.encode(pool.ammConfig),
    }
  }
  return null
}

/**
 * Fold one decoded position plus its pool into the wire shape the panes read.
 *
 * Split out from the RPC walk so the arithmetic has tests: every printed field
 * is derived here, and a mistranslated tick draws a band around the wrong
 * price. Missing pool state degrades to nulls, never to zeroes — "unread" and
 * "empty" are different rows.
 */
export function buildSolanaPositionEntry(opts: {
  raw: RawSolanaLpPosition
  pool: SolanaPoolState | null
  token0: LpPositionToken
  token1: LpPositionToken
  /** The pane's pair as mints, or null when it did not resolve. */
  pairMints: readonly [string, string] | null
}): LpPositionEntry {
  const { raw, pool, token0, token1 } = opts
  const amounts = pool
    ? positionAmounts({
        liquidity: raw.liquidity,
        sqrtPriceX96: pool.sqrtPriceX96,
        currentTick: pool.tick,
        tickLower: raw.tickLower,
        tickUpper: raw.tickUpper,
        decimals0: token0.decimals,
        decimals1: token1.decimals,
      })
    : null

  return {
    market: 'jupiter',
    // The program, not a manager contract: on Solana what identifies a position
    // is (program, position mint).
    managerAddress: PROTOCOL_PROGRAM[raw.protocol],
    // The NFT's mint. It is the direct analogue of an ERC-721 token id, and the
    // position account is `PDA(["position", mint])` of it, so keying on the
    // mint loses nothing.
    tokenId: raw.positionMint,
    dexName: PROTOCOL_LABEL[raw.protocol],
    poolAddress: raw.pool,
    fee: pool?.fee ?? 0,
    feeTier: pool?.fee == null ? null : feeTierFraction(pool.fee),
    token0,
    token1,
    liquidity: raw.liquidity.toString(),
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    currentTick: pool?.tick ?? null,
    sqrtPriceX96: pool ? pool.sqrtPriceX96.toString() : null,
    inRange: pool ? isInRange(pool.tick, raw.tickLower, raw.tickUpper) : null,
    amount0: amounts?.amount0 ?? null,
    amount1: amounts?.amount1 ?? null,
    fees0: descaleAmount(raw.feesOwed0, token0.decimals),
    fees1: descaleAmount(raw.feesOwed1, token1.decimals),
    // The whole reason the field exists. See the module header.
    feesAsOf: 'last-touch',
    priceLower: tickToPrice(raw.tickLower, token0.decimals, token1.decimals),
    priceUpper: tickToPrice(raw.tickUpper, token0.decimals, token1.decimals),
    priceCurrent: pool
      ? sqrtPriceX96ToPrice(pool.sqrtPriceX96, token0.decimals, token1.decimals)
      : null,
    matchesPair: pool
      ? matchesSolanaPair([pool.mint0, pool.mint1], opts.pairMints)
      : null,
  }
}

/**
 * Read every Orca and Raydium position the wallet holds.
 *
 * Errors are data. A node that refuses one batch, a pool that will not decode,
 * a symbol lookup that times out — each becomes an error row or a null field,
 * and the positions that DID read still come back. Only a failure that leaves
 * nothing to show collapses into the single error row at the end.
 */
export async function fetchSolanaLpPositions(opts: {
  owner: string
  rpcUrl: string
  /** Pair key on screen, so entries can be marked as this pool's. */
  pair?: string | null
  cap?: number
  enumerationCap?: number
}): Promise<LpPositionsResponse> {
  const cap = opts.cap ?? SOLANA_LP_POSITION_CAP
  const enumerationCap = opts.enumerationCap ?? SOLANA_LP_ENUMERATION_CAP
  const base: LpPositionsResponse = {
    market: 'jupiter',
    owner: opts.owner,
    positions: [],
    totalFound: 0,
    enumerated: 0,
    listable: 0,
    cap,
    errors: [],
    ts: Date.now(),
  }

  if (!isSolanaLpAddress(opts.owner)) {
    return { ...base, errors: [{ manager: '', message: 'Invalid address' }] }
  }

  const errors: Array<{ manager: string; message: string }> = []

  try {
    const { Connection, PublicKey } = await import('@solana/web3.js')
    const connection = new Connection(opts.rpcUrl, 'confirmed')
    const owner = new PublicKey(opts.owner)

    // ── 1. The wallet's NFTs, from both token programs ──
    // Token-2022 is not optional: every Orca position opened since the
    // extensions migration mints there, so scanning the classic program alone
    // reports a live position as absent.
    const nftMints: Array<string> = []
    for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
          programId: new PublicKey(programId),
        })
        for (const { account } of accounts.value) {
          const info = account.data.parsed?.info as
            | {
                mint?: string
                tokenAmount?: { amount?: string; decimals?: number }
              }
            | undefined
          const amount = info?.tokenAmount
          // A position NFT: exactly one indivisible unit held.
          if (!info?.mint || amount?.amount !== '1' || amount.decimals !== 0) {
            continue
          }
          nftMints.push(info.mint)
        }
      } catch (error) {
        errors.push({
          manager: programId === TOKEN_PROGRAM_ID ? 'SPL Token' : 'Token-2022',
          message: messageOf(error),
        })
      }
    }

    // The population that HAS to be inspected, which on Solana is every
    // NFT-shaped holding rather than a position manager's balance: a wallet's
    // art and its spent LP receipts are indistinguishable until the PDA is
    // probed. So this is an upper bound, exactly as the field documents, and
    // `listable` is the number a pane should count.
    const totalFound = nftMints.length
    if (totalFound === 0) {
      return { ...base, totalFound, errors, ts: Date.now() }
    }

    // ── 2. Candidate position PDAs, derived locally ──
    const inspected = nftMints.slice(0, enumerationCap)
    const candidates: Array<{
      mint: string
      address: InstanceType<typeof PublicKey>
    }> = []
    for (const mint of inspected) {
      let mintKey: InstanceType<typeof PublicKey>
      try {
        mintKey = new PublicKey(mint)
      } catch {
        continue
      }
      for (const programId of [
        ORCA_WHIRLPOOL_PROGRAM_ID,
        RAYDIUM_CLMM_PROGRAM_ID,
      ]) {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from(POSITION_PDA_SEED), mintKey.toBuffer()],
          new PublicKey(programId),
        )
        candidates.push({ mint, address: pda })
      }
    }

    // ── 3. Which of them exist ──
    const raws: Array<RawSolanaLpPosition> = []
    for (const chunk of chunked(candidates, ACCOUNT_BATCH)) {
      const infos = await connection.getMultipleAccountsInfo(
        chunk.map((candidate) => candidate.address),
      )
      infos.forEach((info, index) => {
        if (!info) return
        try {
          const raw = decodePositionAccount({
            positionMint: chunk[index].mint,
            positionAddress: chunk[index].address.toBase58(),
            ownerProgram: info.owner.toBase58(),
            data: new Uint8Array(info.data),
          })
          if (raw) raws.push(raw)
        } catch (error) {
          errors.push({ manager: 'Position', message: messageOf(error) })
        }
      })
    }

    // NFTs actually probed, which is what the field means. Not `raws.length`:
    // most of a wallet's NFTs have no position PDA behind them at all.
    const enumerated = inspected.length
    const listable = raws.filter(isListableSolanaPosition)
    // The cap lands on the LIVE ones, which are what the remaining reads cost.
    const priced = listable.slice(0, cap)
    if (priced.length === 0) {
      return {
        ...base,
        totalFound,
        enumerated,
        listable: listable.length,
        errors,
        ts: Date.now(),
      }
    }

    // ── 4. Pools, then Raydium's shared fee configs ──
    const poolIds = [...new Set(priced.map((raw) => raw.pool))]
    const pools = new Map<string, SolanaPoolState>()
    /** Config account → the pools whose fee tier it carries. */
    const configPools = new Map<string, Array<string>>()
    for (const chunk of chunked(poolIds, ACCOUNT_BATCH)) {
      const infos = await connection.getMultipleAccountsInfo(
        chunk.map((id) => new PublicKey(id)),
      )
      infos.forEach((info, index) => {
        if (!info) return
        try {
          const decoded = decodePoolAccount(new Uint8Array(info.data))
          if (!decoded) return
          pools.set(chunk[index], decoded.state)
          if (decoded.ammConfig) {
            const existing = configPools.get(decoded.ammConfig) ?? []
            existing.push(chunk[index])
            configPools.set(decoded.ammConfig, existing)
          }
        } catch (error) {
          errors.push({ manager: 'Pool', message: messageOf(error) })
        }
      })
    }

    for (const chunk of chunked([...configPools.keys()], ACCOUNT_BATCH)) {
      const infos = await connection.getMultipleAccountsInfo(
        chunk.map((id) => new PublicKey(id)),
      )
      infos.forEach((info, index) => {
        if (!info) return
        try {
          const fee = decodeRaydiumAmmConfigFee(new Uint8Array(info.data))
          for (const poolId of configPools.get(chunk[index]) ?? []) {
            const pool = pools.get(poolId)
            if (pool) pool.fee = fee
          }
        } catch {
          // A missing fee tier costs one column, never the row.
        }
      })
    }

    // ── 5. Token decimals from the chain, symbols from the registry ──
    const mintIds = [
      ...new Set(
        [...pools.values()].flatMap((pool) => [pool.mint0, pool.mint1]),
      ),
    ]
    const tokens = new Map<string, LpPositionToken>()
    for (const chunk of chunked(mintIds, ACCOUNT_BATCH)) {
      let parsed: Array<{ data: unknown } | null> = []
      try {
        const result = await connection.getMultipleParsedAccounts(
          chunk.map((mint) => new PublicKey(mint)),
        )
        parsed = result.value
      } catch (error) {
        errors.push({ manager: 'Token mints', message: messageOf(error) })
      }
      chunk.forEach((mint, index) => {
        const data = parsed[index]?.data as
          | { parsed?: { info?: { decimals?: number } } }
          | undefined
        const decimals = data?.parsed?.info?.decimals
        tokens.set(mint, {
          address: mint,
          // Placeholder until the registry answers. Never blank: the row still
          // has to identify which token it is.
          symbol: shortMint(mint),
          decimals: typeof decimals === 'number' ? decimals : FALLBACK_DECIMALS,
        })
      })
    }
    await applySymbols(tokens)

    // ── 6. The pane's pair, as mints ──
    const pairMints = await resolvePairMintPair(opts.pair)

    const positions = priced.map((raw) => {
      const pool = pools.get(raw.pool) ?? null
      return buildSolanaPositionEntry({
        raw,
        pool,
        token0: tokenOf(tokens, pool?.mint0),
        token1: tokenOf(tokens, pool?.mint1),
        pairMints,
      })
    })

    return {
      ...base,
      positions,
      totalFound,
      enumerated,
      listable: listable.length,
      errors,
      ts: Date.now(),
    }
  } catch (error) {
    return {
      ...base,
      errors: [...errors, { manager: '', message: messageOf(error) }],
      ts: Date.now(),
    }
  }
}

/**
 * Replace placeholder symbols with the registry's, where it knows one.
 *
 * Through the NON-PINNING lookup, which is the whole point. These mints came
 * out of pools the user did not choose, and the trading-path resolver publishes
 * (symbol → mint) to a last-write-wins directory: labelling a position in a
 * scam-USDC pool through it would re-point USDC for every later swap and chart
 * lookup in the session. Best effort either way — a mint the token API has
 * never indexed keeps its shortened address, which is still an honest label.
 */
async function applySymbols(
  tokens: Map<string, LpPositionToken>,
): Promise<void> {
  const resolved = await Promise.allSettled(
    [...tokens.keys()].map(async (mint) => ({
      mint,
      token: await lookupTokenByMint(mint),
    })),
  )
  for (const result of resolved) {
    if (result.status !== 'fulfilled' || !result.value.token) continue
    const entry = tokens.get(result.value.mint)
    if (entry) entry.symbol = result.value.token.symbol
  }
}

/** The pane's pair as its two mints, or null when either leg will not resolve. */
async function resolvePairMintPair(
  pair: string | null | undefined,
): Promise<readonly [string, string] | null> {
  if (!pair) return null
  try {
    const mints = await resolvePairMints(pair)
    if (!mints) return null
    return [mints.inputMint, mints.outputMint] as const
  } catch {
    return null
  }
}

function tokenOf(
  tokens: Map<string, LpPositionToken>,
  mint: string | undefined,
): LpPositionToken {
  const key = mint ?? ''
  return (
    tokens.get(key) ?? {
      address: key,
      symbol: shortMint(key),
      decimals: FALLBACK_DECIMALS,
    }
  )
}

/** `9Wri…bjwz`, for a mint with no known symbol. */
function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function chunked<T>(items: ReadonlyArray<T>, size: number): Array<Array<T>> {
  const out: Array<Array<T>> = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
