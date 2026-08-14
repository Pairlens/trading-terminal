// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Server snapshot sync: fetch the compiled instruments-index blob at idle and
 * cache it in the versioned KV slot the local index reads. Never on the boot
 * critical path, never blocking a picker — a failed or absent fetch leaves
 * the local index exactly as functional as standalone mode.
 *
 * The snapshot download is NOT gated by the deep-search consent toggle: it
 * sends nothing user-typed (a plain GET of a public blob). It is governed
 * only by whether an App Server is configured at all.
 */
import { INSTRUMENTS_INDEX_SCHEMA_VERSION } from '@pairlens/shared/instrument-types'
import { readCcxtKv, writeCcxtKv } from '@pairlens/plugins/ccxt-connector'
import {
  INSTRUMENTS_SNAPSHOT_KV_KEY,
  rebuildLocalInstrumentIndex,
} from './local-index'
import type {
  InstrumentsIndexMeta,
  InstrumentsIndexSnapshot,
} from '@pairlens/shared/instrument-types'
import { appServerUrl } from '@/lib/api'

/** A cached snapshot younger than this skips the meta round-trip entirely. */
const FRESH_ENOUGH_MS = 6 * 60 * 60 * 1000

type RebuildExecutor = Parameters<typeof rebuildLocalInstrumentIndex>[0]

export async function syncInstrumentsSnapshot(
  manager: RebuildExecutor,
): Promise<void> {
  if (!appServerUrl) return
  try {
    const cached = (await readCcxtKv(
      INSTRUMENTS_SNAPSHOT_KV_KEY,
    )) as InstrumentsIndexSnapshot | null
    if (
      cached &&
      cached.schemaVersion === INSTRUMENTS_INDEX_SCHEMA_VERSION &&
      Date.now() - cached.builtAt < FRESH_ENOUGH_MS
    ) {
      return
    }

    const metaRes = await fetch(`${appServerUrl}/api/instruments/index`)
    if (!metaRes.ok) return
    const meta = (await metaRes.json()) as InstrumentsIndexMeta
    if (meta.schemaVersion !== INSTRUMENTS_INDEX_SCHEMA_VERSION) return
    if (cached && cached.builtAt >= meta.builtAt) return

    // Immutable URL — the CDN and browser cache both get to keep it forever.
    const blobRes = await fetch(`${appServerUrl}${meta.url}`)
    if (!blobRes.ok) return
    const snapshot = (await blobRes.json()) as InstrumentsIndexSnapshot
    if (snapshot.schemaVersion !== INSTRUMENTS_INDEX_SCHEMA_VERSION) return

    await writeCcxtKv(INSTRUMENTS_SNAPSHOT_KV_KEY, snapshot)
    await rebuildLocalInstrumentIndex(manager)
  } catch {
    // Offline / server down — the local index stands on its own.
  }
}
