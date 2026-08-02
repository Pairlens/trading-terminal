// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Avatar,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from '@pairlens/ui'

export const VenueAvatars = () => (
  <div
    style={{
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}
  >
    <Avatar>
      <AvatarFallback>OK</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback style={{ background: 'var(--chart-2)', color: '#052' }}>
        BN
      </AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>CB</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>KR</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>BY</AvatarFallback>
    </Avatar>
  </div>
)

export const Sizes = () => (
  <div
    style={{
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}
  >
    <Avatar size="sm">
      <AvatarFallback>SM</AvatarFallback>
    </Avatar>
    <Avatar size="default">
      <AvatarFallback>MD</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>LG</AvatarFallback>
    </Avatar>
  </div>
)

export const WithStatusBadge = () => (
  <div
    style={{
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    <Avatar size="lg">
      <AvatarFallback>OK</AvatarFallback>
      <AvatarBadge style={{ background: 'var(--chart-2)' }} />
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>BN</AvatarFallback>
      <AvatarBadge style={{ background: 'var(--destructive)' }} />
    </Avatar>
    <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
      Connected · Disconnected
    </span>
  </div>
)

export const ConnectedVenuesGroup = () => (
  <div style={{ padding: 16 }}>
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>OK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>BN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>KR</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  </div>
)
