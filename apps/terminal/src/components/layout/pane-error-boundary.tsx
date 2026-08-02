// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import type { ErrorInfo, ReactNode } from 'react'

type Props = {
  paneType: string
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class PaneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[PaneErrorBoundary] ${this.props.paneType} crashed:`,
      error,
      info,
    )
  }

  render() {
    if (this.state.hasError) {
      return <ErrorContent onRetry={() => this.setState({ hasError: false })} />
    }

    return this.props.children
  }
}

function ErrorContent({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <AlertTriangle className="size-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{t('common.error')}</p>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 text-xs"
        onClick={onRetry}
      >
        <RefreshCw className="size-3" />
        {t('common.retry')}
      </Button>
    </div>
  )
}
