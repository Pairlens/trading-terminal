// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  CheckMenuItem,
  IconMenuItem,
  MenuItem,
  PredefinedMenuItem,
  Submenu as SubmenuType,
} from '@tauri-apps/api/menu'

import type { MenuNode } from '@/lib/settings/menu-model'
import i18n from '@/lib/i18n'
import { isMacDesktop } from '@/lib/platform'
import { createMenuModel } from '@/lib/settings/menu-model'
import { subscribeKeybindings } from '@/lib/keybindings/store'

// `@tauri-apps/api/menu` doesn't export the item union as a named type, so we
// mirror the shape its append/insert/items APIs use.
type MenuElement =
  | SubmenuType
  | MenuItem
  | PredefinedMenuItem
  | CheckMenuItem
  | IconMenuItem

/**
 * Enrich the desktop (Tauri) app menu so the OS menubar mirrors the actions
 * offered in the settings dialog: color mode, language, currency, performance,
 * the recent-tickers marquee and inactivity guard toggles (View menu), a
 * Settings/Plugins/account block (app menu), New Window ⌘N (File menu) and a
 * Trading menu (risk + region).
 *
 * The whole menu is built declaratively from `menu-model`, which shares its
 * accessors, stores and option lists with the dialog — one source of truth,
 * two renderers. Check/enabled/label state stays live through each descriptor's
 * `subscribe`, and the menu is rebuilt from scratch when the UI language
 * changes so every label is re-translated.
 *
 * macOS only — that's the one platform where the app always has a global
 * menubar; on Windows/Linux the app intentionally ships without a window menu.
 */

// Loaded lazily so the Tauri menu API stays out of the browser bundle path.
// The type is derived from the loader's inferred return so no `import()` type
// annotation is written in source (which the lint config forbids).
const loadMenuApi = () => import('@tauri-apps/api/menu')
type MenuApi = Awaited<ReturnType<typeof loadMenuApi>>

let initialized = false
let rebuildQueued = false
// Serializes builds: a new applyMenu() always waits for the in-flight one, so
// two runs never interleave over `activeDisposers`.
let rebuildChain: Promise<void> = Promise.resolve()
// Live subscriptions from the CURRENTLY installed menu, disposed atomically when
// the next build is swapped in. Each build collects into its own local array
// (the `sink`) and only publishes it here once it wins.
let activeDisposers: Array<() => void> = []

async function buildNode(
  node: MenuNode,
  api: MenuApi,
  sink: Array<() => void>,
): Promise<MenuElement | null> {
  switch (node.kind) {
    case 'separator':
      return api.PredefinedMenuItem.new({ item: 'Separator' })

    case 'toggle': {
      const item = await api.CheckMenuItem.new({
        id: node.id,
        text: node.text(),
        checked: node.get(),
        enabled: node.isEnabled ? node.isEnabled() : true,
        action: () => node.set(!node.get()),
      })
      sink.push(
        node.subscribe(() => {
          void item.setChecked(node.get())
          if (node.isEnabled) void item.setEnabled(node.isEnabled())
        }),
      )
      return item
    }

    case 'command': {
      const item = await api.MenuItem.new({
        id: node.id,
        text: node.text(),
        accelerator: node.accelerator,
        enabled: node.isEnabled ? node.isEnabled() : true,
        action: () => node.run(),
      })
      if (node.subscribe) {
        sink.push(
          node.subscribe(() => {
            void item.setText(node.text())
            if (node.isEnabled) void item.setEnabled(node.isEnabled())
          }),
        )
      }
      return item
    }

    case 'choice': {
      const selected = node.get()
      const built = await Promise.all(
        node.options().map(async (option) => ({
          value: option.value,
          item: await api.CheckMenuItem.new({
            id: `${node.id}:${option.value}`,
            text: option.text,
            checked: selected === option.value,
            action: () => node.set(option.value),
          }),
        })),
      )
      const submenu = await api.Submenu.new({
        text: node.text(),
        // Disabling the whole submenu, not each option: a radio group the user
        // can open but never act on reads as broken.
        enabled: node.isEnabled ? node.isEnabled() : true,
        items: built.map((entry) => entry.item),
      })
      sink.push(
        node.subscribe(() => {
          const current = node.get()
          for (const entry of built) {
            void entry.item.setChecked(entry.value === current)
          }
          if (node.isEnabled) void submenu.setEnabled(node.isEnabled())
        }),
      )
      return submenu
    }

    case 'submenu': {
      const children: Array<MenuElement> = []
      for (const child of node.items) {
        const item = await buildNode(child, api, sink)
        if (item) children.push(item)
      }
      return api.Submenu.new({ text: node.text(), items: children })
    }
  }
}

async function applyMenu(): Promise<void> {
  const api: MenuApi = await loadMenuApi()

  // Collect this build's subscriptions locally; they only become the active set
  // once the build wins, so overlapping builds can't corrupt each other's list.
  const sink: Array<() => void> = []
  const model = createMenuModel()
  // Menu.default() returns a fresh, un-mutated default menu each call, so a
  // rebuild never stacks duplicate items on top of a prior build.
  const menu = await api.Menu.default()
  const items = await menu.items()

  // 1) App (first) submenu — insert our block just below "About {app}".
  const appSubmenu =
    items[0]?.kind === 'Submenu' ? (items[0] as SubmenuType) : null
  if (appSubmenu) {
    const appLength = (await appSubmenu.items()).length
    let index = Math.min(1, appLength)
    for (const node of model.appMenu) {
      const item = await buildNode(node, api, sink)
      if (item) {
        await appSubmenu.insert(item, index)
        index++
      }
    }
  }

  // 2) File submenu — New Window (⌘N) goes at the top, per macOS convention.
  // Tauri's default macOS menu ships a File submenu (Close Window); extend it
  // when present, otherwise create one right after the app menu.
  let fileSubmenu: SubmenuType | null = null
  for (const item of items) {
    if (item.kind !== 'Submenu') continue
    const submenu = item as SubmenuType
    if ((await submenu.text()) === 'File') {
      fileSubmenu = submenu
      break
    }
  }
  const fileItems: Array<MenuElement> = []
  for (const node of model.file) {
    const item = await buildNode(node, api, sink)
    if (item) fileItems.push(item)
  }
  if (fileSubmenu) {
    let index = 0
    for (const item of fileItems) {
      await fileSubmenu.insert(item, index)
      index++
    }
    // Divide our block from the default items (Close Window).
    await fileSubmenu.insert(
      await api.PredefinedMenuItem.new({ item: 'Separator' }),
      index,
    )
  } else {
    const created = await api.Submenu.new({ text: 'File', items: fileItems })
    await menu.insert(created, Math.min(1, items.length))
  }

  // 3) View submenu — Tauri's default macOS menu already ships one (Enter Full
  // Screen); extend it when present, otherwise create our own.
  let viewSubmenu: SubmenuType | null = null
  for (const item of items) {
    if (item.kind !== 'Submenu') continue
    const submenu = item as SubmenuType
    if ((await submenu.text()) === 'View') {
      viewSubmenu = submenu
      break
    }
  }
  const viewItems: Array<MenuElement> = []
  for (const node of model.view) {
    const item = await buildNode(node, api, sink)
    if (item) viewItems.push(item)
  }
  if (viewSubmenu) {
    for (const item of viewItems) await viewSubmenu.append(item)
  } else {
    const created = await api.Submenu.new({ text: 'View', items: viewItems })
    await menu.insert(created, Math.min(3, items.length))
  }

  // 4) Extra top-level menus (Trading), appended after View.
  for (const extra of model.extraMenus) {
    const item = await buildNode(extra, api, sink)
    if (item) await menu.append(item)
  }

  await menu.setAsAppMenu()

  // Atomically retire the previous build's subscriptions and install this one's.
  for (const dispose of activeDisposers) dispose()
  activeDisposers = sink
}

/** Run applyMenu() serialized behind any in-flight build, swallowing errors. */
function enqueueBuild(onError: string): Promise<void> {
  rebuildChain = rebuildChain.then(applyMenu).catch((err) => {
    console.warn(onError, err)
  })
  return rebuildChain
}

function scheduleRebuild(): void {
  // Coalesce bursts (e.g. rapid language switches) into a single queued rebuild,
  // and serialize execution so builds never overlap on `activeDisposers`.
  if (rebuildQueued) return
  rebuildQueued = true
  rebuildChain = rebuildChain
    .then(() => {
      rebuildQueued = false
      return applyMenu()
    })
    .catch((err) => {
      rebuildQueued = false
      console.warn('[desktop-menu] failed to rebuild app menu:', err)
    })
}

export async function initDesktopMenu(): Promise<void> {
  // macOS only. Windows/Linux ship no window menu, so the same commands are
  // bound as in-app accelerators by `menu-shortcuts.ts` instead — New Window
  // must have a working trigger on every desktop platform.
  if (!isMacDesktop || initialized) return
  initialized = true

  // Re-translate the whole menu when the UI language changes, and re-issue the
  // accelerators when the user rebinds a keyboard shortcut.
  i18n.on('languageChanged', scheduleRebuild)
  subscribeKeybindings(scheduleRebuild)

  await enqueueBuild('[desktop-menu] failed to initialize app menu:')
}
