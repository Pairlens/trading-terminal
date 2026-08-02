# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via [GitHub Security Advisories](https://github.com/Pairlens/trading-terminal/security/advisories/new). Do **not** open a public issue for security problems.

Include what you can: affected component (terminal, desktop app, app server, a specific connector), reproduction steps, and impact. You should receive an initial response within a few days.

## Scope notes

Pairlens handles exchange API keys and wallet secrets **locally** — they are stored in the OS keychain (or encrypted local storage) and must never reach Pairlens servers. Reports about credential handling, order routing, or the plugin sandbox are especially valuable.

When reporting:

- **Never include real credentials** — no API keys, wallet private keys, or seed phrases in reports, logs, or proof-of-concept code. Use throwaway/testnet credentials.
- Self-hosted App Server misconfigurations (e.g. weak `BETTER_AUTH_SECRET` you set yourself) are out of scope; defects in the defaults are in scope.

## Bug bounty

There is currently no bug bounty program. We are grateful for responsible disclosure and will credit reporters in release notes unless you prefer otherwise.
