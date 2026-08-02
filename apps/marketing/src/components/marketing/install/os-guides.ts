// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Per-OS guidance for /install: the download sub-line and the three
// "after the download" steps. Installer hrefs, taglines and formats stay in
// INSTALLERS (src/lib/site.ts) — this only adds what the page narrates.

export type InstallStep = {
  n: string
  title: string
  body: string
  /** Optional shell command, rendered as a copyable terminal row. */
  cmd?: string
}

export type OsGuide = {
  sub: string
  steps: ReadonlyArray<InstallStep>
}

/** Selected on the server and whenever OS detection comes back empty. */
export const DEFAULT_OS = 'macOS'

export const OS_GUIDES: Record<string, OsGuide> = {
  macOS: {
    sub: 'Apple silicon .dmg — Intel build linked below',
    steps: [
      {
        n: '01',
        title: 'Open the .dmg',
        body: 'Double-click the file you just downloaded. A window opens with Pairlens beside your Applications folder.',
      },
      {
        n: '02',
        title: 'Drag it across',
        body: 'Drop Pairlens into Applications. That is the entire install — nothing is written outside that folder.',
      },
      {
        n: '03',
        title: 'Let it past Gatekeeper',
        body: 'Until our Apple Developer signing lands, macOS flags the download and may claim the app is "damaged" — it isn\'t. Run this once in Terminal to clear the flag, then launch Pairlens from Applications. Venue keys go to your Keychain when you connect one.',
        cmd: 'xattr -cr /Applications/Pairlens.app',
      },
    ],
  },
  Windows: {
    sub: '.exe setup — Windows 10 and 11, 64-bit',
    steps: [
      {
        n: '01',
        title: 'Run the setup',
        body: 'Double-click the setup you just downloaded and pick a folder. Prefer the Windows installer format? The .msi link sits right under the download button.',
      },
      {
        n: '02',
        title: 'Get past SmartScreen',
        body: 'Windows may warn about an unrecognized app while our builds earn their reputation. Choose More info, then Run anyway — every build ships from public CI you can read.',
      },
      {
        n: '03',
        title: 'Open from the Start menu',
        body: 'Pairlens keeps itself current from then on; new versions install on the next launch.',
      },
    ],
  },
  Linux: {
    sub: 'AppImage — .deb and .rpm linked below',
    steps: [
      {
        n: '01',
        title: 'Pick a format',
        body: 'The AppImage you just downloaded runs anywhere without installing. On Debian and Ubuntu the .deb integrates better; Fedora takes the .rpm.',
      },
      {
        n: '02',
        title: 'Install the .deb',
        body: 'apt resolves the dependencies for you.',
        cmd: 'sudo apt install ./Pairlens-Linux.deb',
      },
      {
        n: '03',
        title: 'Or run the AppImage',
        body: 'Mark it executable once, then launch it like any other binary.',
        cmd: 'chmod +x Pairlens-Linux.AppImage',
      },
    ],
  },
}
