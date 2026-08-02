// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { communityDtoToTemplate, hasUsableLayout } from '../community-mapping'
import type { CommunityWorkspaceDto } from '@/lib/api'
import type { TerminalLayout } from '@/lib/layout/types'

const LAYOUT: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'c0',
      widthPercent: 100,
      cells: [
        {
          id: 'cell0',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [
            { id: 'p0', type: 'chart', bindings: { 'active-pair': '$pair' } },
          ],
        },
      ],
    },
  ],
}

function makeDto(
  overrides: Partial<CommunityWorkspaceDto> = {},
): CommunityWorkspaceDto {
  return {
    id: 'abc-123',
    name: 'My Cockpit',
    tagline: 'Fast scalping desk',
    description: 'A desk for scalping.',
    icon: 'Crosshair',
    author: 'satoshi',
    facets: {
      traderTypes: ['scalper', 'bogus-trader'],
      assetClasses: ['crypto-spot'],
      screenSizes: ['standard'],
    },
    tags: ['fast', 'orderbook'],
    variables: [
      {
        name: '$pair',
        label: 'Pair',
        type: 'pair',
        defaultValue: { pairKey: 'BTC-USDT', market: 'okx' },
      },
    ],
    layout: LAYOUT,
    requiredPlugins: [],
    installs: 7,
    favorites: 3,
    mine: false,
    faved: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('communityDtoToTemplate', () => {
  it('namespaces the id by provider so it never collides with a builtin id', () => {
    const tpl = communityDtoToTemplate(makeDto())
    expect(tpl.id).toBe('community:pairlens-community:abc-123')
    expect(tpl.id.startsWith('template:')).toBe(false)
  })

  it('namespaces per provider so two stores can share a submission id', () => {
    const a = communityDtoToTemplate(makeDto(), 'pairlens-community')
    const b = communityDtoToTemplate(makeDto(), 'acme-store')
    expect(a.id).not.toBe(b.id)
    expect(b.community?.providerId).toBe('acme-store')
  })

  it('tags the template as a community origin with submission metadata', () => {
    const tpl = communityDtoToTemplate(
      makeDto({ installs: 12, favorites: 5, mine: true, faved: true }),
    )
    expect(tpl.origin).toBe('community')
    expect(tpl.community).toEqual({
      submissionId: 'abc-123',
      providerId: 'pairlens-community',
      installs: 12,
      favorites: 5,
      mine: true,
      faved: true,
      createdAt: 1_700_000_000_000,
    })
  })

  it('drops facet values that are not part of the known taxonomies', () => {
    const tpl = communityDtoToTemplate(makeDto())
    expect(tpl.facets.traderTypes).toEqual(['scalper'])
    expect(tpl.facets.assetClasses).toEqual(['crypto-spot'])
    expect(tpl.facets.screenSizes).toEqual(['standard'])
  })

  it('falls back to a generic author and derives text when fields are blank', () => {
    const tpl = communityDtoToTemplate(
      makeDto({ author: '', tagline: '', description: '' }),
    )
    expect(tpl.author).toBe('Community')
    // tagline/description fall back to the name so cards/dialogs never render empty.
    expect(tpl.tagline).toBe('My Cockpit')
    expect(tpl.description).toBe('My Cockpit')
  })

  it('carries the layout and variables through unchanged', () => {
    const tpl = communityDtoToTemplate(makeDto())
    expect(tpl.layout).toBe(LAYOUT)
    expect(tpl.variables).toHaveLength(1)
    expect(tpl.context).toBe('standalone')
  })
})

describe('hasUsableLayout', () => {
  it('accepts a fully-structured layout', () => {
    expect(hasUsableLayout(makeDto())).toBe(true)
  })

  it('rejects a missing or empty layout', () => {
    expect(
      hasUsableLayout(makeDto({ layout: { version: 1, columns: [] } })),
    ).toBe(false)
    expect(
      hasUsableLayout(
        makeDto({ layout: undefined as unknown as TerminalLayout }),
      ),
    ).toBe(false)
  })

  it('rejects a malformed layout (column without cells) — the crash guard', () => {
    const bad = {
      version: 1,
      columns: [{ id: 'c0', widthPercent: 100 }],
    } as unknown as TerminalLayout
    expect(hasUsableLayout(makeDto({ layout: bad }))).toBe(false)
  })

  it('rejects a cell without panes and a pane without a type', () => {
    const noPanes = {
      version: 1,
      columns: [
        {
          id: 'c0',
          widthPercent: 100,
          cells: [{ id: 'x', heightPercent: 100 }],
        },
      ],
    } as unknown as TerminalLayout
    expect(hasUsableLayout(makeDto({ layout: noPanes }))).toBe(false)

    const noType = {
      version: 1,
      columns: [
        {
          id: 'c0',
          widthPercent: 100,
          cells: [
            {
              id: 'x',
              heightPercent: 100,
              activeTabIndex: 0,
              panes: [{ id: 'p' }],
            },
          ],
        },
      ],
    } as unknown as TerminalLayout
    expect(hasUsableLayout(makeDto({ layout: noType }))).toBe(false)
  })

  it('rejects an over-cap layout (too many total panes)', () => {
    // 16 columns × 16 panes = 256 panes, over the 200 ceiling.
    const columns = Array.from({ length: 16 }, (_c, ci) => ({
      id: `c${ci}`,
      widthPercent: 100 / 16,
      cells: [
        {
          id: `cell${ci}`,
          heightPercent: 100,
          activeTabIndex: 0,
          panes: Array.from({ length: 16 }, (_p, pi) => ({
            id: `p-${ci}-${pi}`,
            type: 'chart',
          })),
        },
      ],
    }))
    const layout = { version: 1, columns } as unknown as TerminalLayout
    expect(hasUsableLayout(makeDto({ layout }))).toBe(false)
  })
})
