// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// React's window onto the skin store. Kept out of `skin.ts` so the bar's page
// script can import the store without pulling a renderer into that bundle.
import { useSyncExternalStore } from 'react'
import {
  DEFAULT_PAGE_SKIN,
  getPageSkin,
  pageSkinView,
  subscribePageSkin,
} from './skin'
import type { PageSkinView } from './skin'

const serverSkin = () => DEFAULT_PAGE_SKIN

export function usePageSkin(): PageSkinView {
  const skin = useSyncExternalStore(subscribePageSkin, getPageSkin, serverSkin)
  return pageSkinView(skin)
}
