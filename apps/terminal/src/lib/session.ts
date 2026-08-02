// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { authClient, hasAppServer } from '@/lib/auth-client'

export function useOptimisticSession() {
  const sessionState = authClient.useSession()

  // No App Server configured → skip auth entirely
  if (!hasAppServer) {
    return {
      ...sessionState,
      session: null,
      isCheckingSession: false,
    }
  }

  return {
    ...sessionState,
    session: sessionState.data,
    isCheckingSession: sessionState.isPending && !sessionState.data,
  }
}
