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
    sub: 'Universal .dmg — Apple silicon and Intel',
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
        title: 'Launch it',
        body: 'Builds are code-signed, so it opens on the first try. Venue keys go to your Keychain when you connect one.',
      },
    ],
  },
  Windows: {
    sub: '.msi installer — Windows 10 and 11, 64-bit',
    steps: [
      {
        n: '01',
        title: 'Run the .msi',
        body: 'Double-click the installer and pick a folder. The .exe is there too if you would rather not run the Windows installer.',
      },
      {
        n: '02',
        title: 'Check the publisher',
        body: 'Windows shows the signature before it installs anything. It reads Pairlens — every build is code-signed.',
      },
      {
        n: '03',
        title: 'Open from the Start menu',
        body: 'Pairlens keeps itself current from then on; new versions install on the next launch.',
      },
    ],
  },
  Linux: {
    sub: '.deb and .AppImage — Debian, Ubuntu, Fedora',
    steps: [
      {
        n: '01',
        title: 'Pick a format',
        body: 'Take the .deb on Debian and Ubuntu. The .AppImage runs anywhere without installing.',
      },
      {
        n: '02',
        title: 'Install the .deb',
        body: 'apt resolves the dependencies for you.',
        cmd: 'sudo apt install ./pairlens_amd64.deb',
      },
      {
        n: '03',
        title: 'Or run the AppImage',
        body: 'Mark it executable once, then launch it like any other binary.',
        cmd: 'chmod +x Pairlens.AppImage',
      },
    ],
  },
}
