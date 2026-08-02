// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
  Button,
} from '@pairlens/ui'

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 480 }}>
    <Alert>
      <AlertTitle>Signal detected</AlertTitle>
      <AlertDescription>
        A breakout on ETH / USDT crossed your 4h EMA. The AI co-pilot rated this
        setup APPROVE with medium confidence.
      </AlertDescription>
    </Alert>
  </div>
)

export const Destructive = () => (
  <div style={{ padding: 16, maxWidth: 480 }}>
    <Alert variant="destructive">
      <AlertTitle>Risk limit reached</AlertTitle>
      <AlertDescription>
        This order would push daily drawdown past your 5% guardrail. Adjust the
        size or wait for the limit to reset before continuing.
      </AlertDescription>
    </Alert>
  </div>
)

export const WithAction = () => (
  <div style={{ padding: 16, maxWidth: 480 }}>
    <Alert>
      <AlertTitle>Exchange keys not connected</AlertTitle>
      <AlertDescription>
        Connect an exchange to route live orders. Keys stay in your OS keychain
        and are never sent to Pairlens servers.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          Connect
        </Button>
      </AlertAction>
    </Alert>
  </div>
)
