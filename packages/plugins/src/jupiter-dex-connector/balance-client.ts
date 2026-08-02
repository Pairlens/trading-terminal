// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { getKnownTokenByMint } from './token-registry'
import type { NormalizedBalance } from '@pairlens/market-engine/types'

/**
 * Fetch SPL token balances for a Solana wallet.
 * Dynamically imports @solana/web3.js (code-split).
 */
export async function fetchBalances(
  walletAddress: string,
  rpcUrl: string,
): Promise<Array<NormalizedBalance>> {
  try {
    const { Connection, PublicKey, LAMPORTS_PER_SOL } =
      await import('@solana/web3.js')

    const connection = new Connection(rpcUrl, 'confirmed')
    const pubkey = new PublicKey(walletAddress)

    // Fetch SOL balance
    const solBalance = await connection.getBalance(pubkey)
    const balances: Array<NormalizedBalance> = [
      {
        currency: 'SOL',
        available: (solBalance / LAMPORTS_PER_SOL).toFixed(9),
        frozen: '0',
        total: (solBalance / LAMPORTS_PER_SOL).toFixed(9),
      },
    ]

    // Fetch SPL token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      pubkey,
      {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      },
    )

    for (const { account } of tokenAccounts.value) {
      const info = account.data.parsed?.info as
        | {
            mint: string
            tokenAmount: {
              uiAmountString: string
              uiAmount: number
            }
          }
        | undefined
      if (!info || info.tokenAmount.uiAmount === 0) continue

      balances.push({
        // Label with the known symbol when the mint has been seen via
        // discovery/search; abbreviated mint as fallback
        currency:
          getKnownTokenByMint(info.mint)?.symbol ?? info.mint.slice(0, 8),
        available: info.tokenAmount.uiAmountString,
        frozen: '0',
        total: info.tokenAmount.uiAmountString,
      })
    }

    return balances
  } catch {
    return []
  }
}
