# Security Policy

The Morpho SDK packages are used to build transactions that can move real funds on the Morpho protocol. We take security reports seriously.

## Reporting a Vulnerability

Do not open a public GitHub issue for security reports.

Email **security@morpho.org** with:

- A description of the issue and its impact.
- Steps to reproduce, ideally with a minimal proof of concept.
- The affected package and version.
- Any suggested mitigation.

You will receive an acknowledgement within 72 hours. We aim to provide an initial assessment and triage within 7 days.

## Coordinated Disclosure

- Give us reasonable time to investigate and patch before public disclosure.
- We will keep you informed of progress and credit you in release notes unless you prefer to remain anonymous.
- For issues affecting funds at rest or in flight, we may coordinate an out-of-cycle release and brief known downstream integrators before publishing details.

## Supported Versions

Only the latest published versions of maintained `@morpho-org/*` SDK packages receive security fixes. The legacy `@morpho-org/consumer-sdk` package is deprecated; security fixes are published only to maintained packages in this monorepo.

## Scope

In scope:

- Transaction-building bugs that could cause loss of funds, such as bad calldata, wrong `value`, or missing slippage protection.
- Signature request bugs, such as wrong typed data or domain separators.
- Supply-chain issues in this repository or its published npm packages.
- Issues in CI/CD that could compromise published artifacts.

Out of scope:

- Issues in `viem`, `wagmi`, or other third-party dependencies; report these upstream.
- Social-engineering, DoS on npm or GitHub, and physical attacks.

## Dependency Version Ranges

Runtime dependencies in package manifests, including `@morpho-org/*` packages, may use caret ranges. This lets coordinated patch and minor releases reach SDK consumers without requiring a release for every upstream patch.

Consumers still resolve dependencies through their own lockfile, so caret ranges float only on fresh installs or explicit updates. We recommend:

- Commit your lockfile and install with `npm ci` or `pnpm install --frozen-lockfile` in CI.
- Run `npm audit signatures` after installs to verify provenance.
- If you require stricter isolation, pin `@morpho-org/*` to exact versions in your own manifest, or use `overrides` or `resolutions` to pin transitive versions.

## Release Pipeline Hardening

Packages are packed in an unprivileged CI job and published from a separate privileged job that treats the packed tarballs as untrusted input. Before publishing, the privileged job checks that each tarball's `name`/`version` matches the source tree allowlist. That identity is read through npm's own manifest reader (`pacote.manifest`, the same call `npm publish` makes, via `scripts/ci/read-tarball-identity.ts`) rather than by listing or extracting the archive with a different tool. In addition, each tarball is rejected if npm's bundled node-tar reports entries that would collide after consumer-filesystem normalization (`scripts/ci/verify-tarball-collisions.ts`). Tar entries such as `package/\./package.json` or a second archive root are normalized differently by GNU tar and node-tar, so a check that uses a different reader than npm can be fooled into approving a tarball that npm would publish under another identity. GNU tar structural checks remain as defense in depth only. The full rule set lives in `AGENTS.md` §10 ("Artifact identity: ask the consumer, don't emulate it").

## Verification

Releases published by official CI use npm provenance through Sigstore where package publishing supports it. Consumers can verify provenance with:

```bash
npm audit signatures
```
