// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the desktop app comes from, for the browser build's "get the desktop
 * app" prompt.
 *
 * The URLs are the same evergreen release aliases the marketing site links
 * (`apps/marketing/src/lib/site.ts` → `INSTALLERS`): the release workflow
 * uploads version-less copies of every installer next to the versioned ones
 * (`.github/workflows/release.yml`, "Attach evergreen download aliases"), so
 * `releases/latest/download/<alias>` always resolves to the newest build.
 * Keep this table and marketing's in step — the aliases are produced in one
 * place, the workflow, and both sites are consumers.
 */

export const REPO_URL = 'https://github.com/Pairlens/trading-terminal'

/**
 * Device-local flag behind the nav button's ping badge — set the first time
 * the dialog is opened. Stored as `pairlens:desktop-cta-seen` (usePersistedState
 * adds the prefix). Never synced: "have I seen this nudge" is per device, like
 * the analytics consent flag next to it.
 */
export const DESKTOP_CTA_SEEN_KEY = 'desktop-cta-seen'

/** Evergreen direct-download URL for a release-asset alias. */
export const downloadAsset = (alias: string) =>
  `${REPO_URL}/releases/latest/download/${alias}`

export type DesktopOs = 'macos' | 'windows' | 'linux'

export type DesktopBuild = {
  os: DesktopOs
  /** i18n key for the OS name — the label users read. */
  nameKey: string
  /** The build the big button downloads. */
  primary: { label: string; labelKey: string; asset: string }
  /** Same OS, other formats/architectures — offered as small links. */
  alternates: ReadonlyArray<{ label: string; labelKey: string; asset: string }>
}

export const DESKTOP_BUILDS: ReadonlyArray<DesktopBuild> = [
  {
    os: 'macos',
    nameKey: 'desktopCta.macos',
    primary: {
      label: 'Apple silicon (.dmg)',
      labelKey: 'desktopCta.assets.macos.primary',
      asset: 'Pairlens-macOS-AppleSilicon.dmg',
    },
    alternates: [
      {
        label: 'Intel Mac (.dmg)',
        labelKey: 'desktopCta.assets.macos.intel',
        asset: 'Pairlens-macOS-Intel.dmg',
      },
    ],
  },
  {
    os: 'windows',
    nameKey: 'desktopCta.windows',
    primary: {
      label: 'Installer (.exe)',
      labelKey: 'desktopCta.assets.windows.primary',
      asset: 'Pairlens-Windows-Setup.exe',
    },
    alternates: [
      {
        label: '.msi installer',
        labelKey: 'desktopCta.assets.windows.msi',
        asset: 'Pairlens-Windows.msi',
      },
    ],
  },
  {
    os: 'linux',
    nameKey: 'desktopCta.linux',
    primary: {
      label: 'AppImage',
      labelKey: 'desktopCta.assets.linux.primary',
      asset: 'Pairlens-Linux.AppImage',
    },
    alternates: [
      {
        label: '.deb',
        labelKey: 'desktopCta.assets.linux.deb',
        asset: 'Pairlens-Linux.deb',
      },
      {
        label: '.rpm',
        labelKey: 'desktopCta.assets.linux.rpm',
        asset: 'Pairlens-Linux.rpm',
      },
    ],
  },
]

/**
 * Which OS the browser is running on, or null when it isn't one we ship for
 * (phones, tablets, anything unrecognised) — the dialog then presents the
 * three builds evenly instead of guessing a primary.
 *
 * Apple silicon vs Intel is deliberately NOT sniffed: the browser can't say
 * reliably, and getting it wrong hands someone a Mac build that won't run.
 * Apple silicon is the big button (every Mac sold since 2020), Intel the
 * link right beside it — same call the marketing install page makes.
 */
export function detectOs(): DesktopOs | null {
  if (typeof navigator === 'undefined') return null
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData
  const source =
    `${uaData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase()

  // iOS/Android first: an iPad reports "macintosh", and no phone runs a
  // desktop build.
  if (/android|iphone|ipad|ipod/.test(source)) return null
  if (/mac/.test(source)) return 'macos'
  if (/win/.test(source)) return 'windows'
  if (/linux|x11|cros/.test(source)) return 'linux'
  return null
}
