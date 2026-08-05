// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import './lib/i18n'
import { createRouter } from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { createQueryClient } from './lib/query-client'

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-6xl font-bold text-muted-foreground/30">
        404
      </p>
      <p className="text-sm text-muted-foreground">
        {t('routes.notFound.title')}
      </p>
      <a
        href="/"
        className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {t('routes.goHome')}
      </a>
    </div>
  )
}

// Create a new router instance
export const getRouter = () => {
  const queryClient = createQueryClient()

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
    context: {
      queryClient,
    },
  })

  return routerWithQueryClient(router, queryClient)
}
