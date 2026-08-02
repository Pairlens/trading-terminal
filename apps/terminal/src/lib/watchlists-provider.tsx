// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'

import { usePersistence } from '@/lib/pairlens-provider'
import { useOptimisticSession } from '@/lib/session'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { AddToWatchlistDialog } from '@/components/watchlist/add-to-watchlist-dialog'

export function WatchlistsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const persistence = usePersistence()
  const { session } = useOptimisticSession()
  const userId = session?.user?.id ?? 'local'

  useEffect(() => {
    void useWatchlistsStore.getState().init(persistence, userId)
    return () => {
      useWatchlistsStore.getState().dispose()
    }
  }, [persistence, userId])

  return (
    <>
      {children}
      <AddToWatchlistDialog />
    </>
  )
}
