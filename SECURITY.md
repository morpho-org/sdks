# Security Policy

The Morpho SDK packages build transactions and signature requests that move real funds on the Morpho protocol. This document is for security researchers, auditors and integrators. It covers how to report a vulnerability, what is in scope, the guarantees the SDKs commit to, how releases are produced and verified, and how to use the SDKs safely.

[`THREAT_MODEL.md`](./THREAT_MODEL.md) is the source of truth for what the SDKs trust and what they check. This file summarizes it and does not repeat it.

## Contents

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [Severity and response targets](#severity-and-response-targets)
- [Safe harbor](#safe-harbor)
- [Coordinated disclosure](#coordinated-disclosure)
- [Scope](#scope)
- [Security invariants](#security-invariants)
- [Supported versions](#supported-versions)
- [Release integrity and verification](#release-integrity-and-verification)
- [Dependency policy](#dependency-policy)
- [Audits and assurance](#audits-and-assurance)
- [Secure usage for integrators](#secure-usage-for-integrators)
- [Keeping this document accurate](#keeping-this-document-accurate)

## Reporting a vulnerability

Do not open a public GitHub issue, discussion or pull request for a security report.

Email **security@morpho.org**. Include:

- the affected package(s) and version(s);
- a description of the issue and its impact, ideally with the funds or users at risk;
- steps to reproduce, ideally a minimal proof of concept (a script against an Anvil fork at a pinned block is ideal);
- any suggested mitigation.

No PGP key or `security.txt` is published for this repository; use email.

### SDK or protocol?

This policy covers the off-chain TypeScript code in this repository. If the root cause is in a deployed Morpho smart contract (Morpho Blue, Vaults, periphery and bundler contracts), report it through the [Morpho bug bounty on Immunefi](https://immunefi.com/bug-bounty/morpho/information/) instead. If you are not sure which side the bug is on, email security@morpho.org and we will route it.

## Severity and response targets

We classify reports by their impact on SDK users. The examples are illustrative, not exhaustive.

| Severity | Meaning | SDK examples |
| --- | --- | --- |
| **Critical** | Direct, likely loss of user funds or approvals with default SDK usage and an honest RPC. | Calldata that sends assets to an address other than the requested receiver; an approval or permit granted to the wrong spender; a builder that drops the slippage or share-price bound entirely. |
| **High** | Loss of funds that needs a specific but realistic setup, or a compromise of the release pipeline. | Wrong EIP-712 domain or chain binding that lets a signature be replayed; a wrong per-chain address in the registry; a way to publish an `@morpho-org/*` version without passing the release checks. |
| **Medium** | Bounded or conditional loss, or a guard that can be bypassed by unusual but valid input. | A slippage or LLTV buffer computed looser than documented; a simulation that reports success for a bundle that reverts or leaves funds behind on-chain. |
| **Low** | Little or no direct loss; griefing or degraded safety margins. | A leftover dust balance in an adapter; a typed error that fires late instead of early. |
| **Informational** | Hardening or documentation suggestions with no demonstrated impact. | Missing input validation that the contracts already enforce; unclear JSDoc on a security-relevant parameter. |

Response targets, counted from the acknowledgement:

| Severity | Acknowledgement | Initial assessment | Fix target |
| --- | --- | --- | --- |
| Critical | 72 hours | 3 days | Out-of-band patch release as soon as a fix is verified |
| High | 72 hours | 7 days | Next patch release, at most 30 days |
| Medium | 72 hours | 7 days | 90 days |
| Low / Informational | 72 hours | 14 days | Best effort, usually the next minor |

These are targets, not contractual deadlines. We will tell you if we expect to miss one.

## Safe harbor

We will not pursue or support legal action against you for security research on these packages that:

- is done in good faith and reported to us promptly;
- uses your own accounts, local nodes or forks, and does not touch other users' funds or data;
- does not degrade npm, GitHub or Morpho services (no denial of service, no spam);
- keeps the details confidential until the issue is fixed and disclosure is agreed.

If you are unsure whether an activity is covered, ask security@morpho.org first. Testing against deployed contracts is governed by the Immunefi program's own rules.

## Coordinated disclosure

- Give us reasonable time to investigate and ship a fix before any public disclosure.
- We keep you informed of progress and credit you in the release notes unless you prefer to stay anonymous.
- For issues that put funds at rest or in flight at risk, we may ship an out-of-cycle release and brief known downstream integrators before publishing details.

## Scope

### Packages

| Package | In scope | Notes |
| --- | --- | --- |
| [`@morpho-org/morpho-sdk`](./packages/morpho-sdk) | Yes | High-level entities and actions; builds the transactions and signature requests integrators submit. |
| [`@morpho-org/blue-sdk`](./packages/blue-sdk) | Yes | Protocol entities and math used for previews and bounds. |
| [`@morpho-org/blue-sdk-viem`](./packages/blue-sdk-viem) | Yes | On-chain fetchers, including deployless queries. |
| [`@morpho-org/morpho-ts`](./packages/morpho-ts) | Yes | Shared utilities, ABIs and the per-chain address registry. |
| [`@morpho-org/midnight-sdk`](./packages/midnight-sdk) | Yes | Midnight offers, signatures and bundles. |
| [`@morpho-org/evm-simulation`](./packages/evm-simulation) | Yes | Transaction simulation and balance-change checks. |
| [`@morpho-org/wdk-protocol-lending-morpho-evm`](./packages/wdk-protocol-lending-morpho-evm) | Yes | WDK lending module, including ERC-4337 and paymaster flows. |
| [`@morpho-org/liquidity-sdk-viem`](./packages/liquidity-sdk-viem) | Limited | Deprecated (see its [`DEPRECATED.md`](./packages/liquidity-sdk-viem/DEPRECATED.md)). Reports are accepted, but fixes are not guaranteed. |
| [`@morpho-org/test`](./packages/test), [`@morpho-org/morpho-test`](./packages/morpho-test) | No | Test fixtures and harnesses, not meant for production. Supply-chain issues in their published tarballs are still in scope. |
| `@morpho-org/consumer-sdk` | No | Legacy predecessor of `@morpho-org/morpho-sdk`; not maintained in this repository. |
| CI/CD, release scripts and workflows in this repository | Yes | Anything that could change what is published to npm. |

### Vulnerability classes in scope

- Wrong calldata, target or `value` in a built transaction, including native-token wrapping.
- Missing, wrong or bypassable slippage, share-price, deadline or LLTV-buffer protection.
- Wrong EIP-712 typed data, domain separator, chain id, spender, nonce or deadline in a signature request.
- Wrong or missing per-chain addresses in the registry, or a registry that can be silently overridden.
- Unsafe defaults in bundler flows: approvals larger than needed, leftover approvals or balances, or funds routed to the wrong receiver.
- Deployless-query bytecode or decoding bugs that mis-report state with an honest RPC.
- Simulation results from `evm-simulation` that diverge from the on-chain outcome with an honest backend.
- Supply-chain or CI issues that could alter a published package.

### Out of scope

- Bugs in `viem`, `wagmi` or other third-party dependencies; report them upstream. A way the SDK misuses a dependency is in scope.
- Bugs in deployed smart contracts; see [SDK or protocol?](#sdk-or-protocol).
- Findings whose only precondition is a malicious or compromised RPC, simulation, bundler or paymaster endpoint, unless the report shows a check the SDK could make against a source the endpoint cannot forge. [`THREAT_MODEL.md`](./THREAT_MODEL.md) lists each audited case, what the SDK checks and its accepted gaps.
- Findings whose only precondition is a malicious integrator: a wrong client-to-chain pairing, an attacker-chosen address passed in or registered by the integrator, or a modified SDK. See [`THREAT_MODEL.md`](./THREAT_MODEL.md#integrator-inputs-and-the-address-registry).
- Social engineering, denial of service against npm or GitHub, and physical attacks.

### Trust boundaries in short

The SDKs trust the endpoints the integrator configures (JSON-RPC node, simulation backends, ERC-4337 bundler and paymaster) and the inputs the integrator passes in. They check what they can against data the endpoint cannot forge, for example that fetched market params hash to the requested market id. [`THREAT_MODEL.md`](./THREAT_MODEL.md) has the full list.

## Security invariants

These are the guarantees the codebase commits to ([`AGENTS.md`](./AGENTS.md) §5 "Security invariants are tests"). A change that weakens one is a security bug.

| ID | Invariant | What it means | Where it is enforced |
| --- | --- | --- | --- |
| INV-01 | Deposit routing | Vault deposits, `withdraw`, `redeem`, `inKindRedeem` and `forceWithdraw` go through the audited periphery (VaultBundlesV1, VaultExitBundlesV1), and Blue writes through BlueBundlesV1. The one exception is Vault V2 `forceRedeem`, a direct `VaultV2.multicall` of caller-supplied `forceDeallocate` calls followed by the redeem. | `morpho-sdk` actions; see [its README](./packages/morpho-sdk/README.md#how-it-works). |
| INV-02 | Inflation-attack guard | Vault V1 and Vault V2 deposits, and the Vault V1 to V2 migration, carry a maximum share price derived from accrued vault state and a bounded slippage tolerance, so a manipulated share price makes the transaction revert. Morpho Blue `supply` and `supplyCollateralBorrow` carry no share-price bound. | `computeVaultMaxSharePrice` and `MAX_ABSOLUTE_SHARE_PRICE` in [`packages/morpho-sdk/src/helpers`](./packages/morpho-sdk/src/helpers). |
| INV-03 | LLTV buffer | Morpho Blue borrows and collateral withdrawals keep the position at least `DEFAULT_LLTV_BUFFER` (0.5%) below the liquidation LTV. The buffer is fixed, not configurable. Midnight borrow and collateral-withdraw flows do not apply it. | `DEFAULT_LLTV_BUFFER`, `validatePositionHealth` and `validatePositionHealthAfterWithdraw`. |
| INV-04 | Bounded slippage | Where a flow accepts a slippage tolerance (Vault V1 and Vault V2 flows), it is non-negative and at most `MAX_SLIPPAGE_TOLERANCE` (10%). Morpho Blue flows take no slippage tolerance. | `validateSlippageTolerance`. |
| INV-05 | `chainId` validation | Entities and actions refuse to build for a client on a different chain than expected. | `validateChainId` (`ChainIdMismatchError`) in the Blue, Vault V1, Vault V2 and Midnight entities and the requirement builders. `validateMidnightMarketChainId` is exported for integrators but not called by the SDK itself. |
| INV-06 | Authorization | Approvals, permits and Morpho authorizations are requested only for the expected spender, and signature helpers check the signer is the expected `userAddress`. | `validateRequirementSpender`, the requirement builders under `actions/requirements`, `signAndVerifyTypedData`. |
| INV-07 | Accounting | Morpho Blue withdrawals and repayments never exceed the position they act on, and Midnight `redeem` never exceeds the user's credit. Vault V1/V2 `withdraw`/`redeem` and Midnight `repayWithdrawCollateral` are bounded only on-chain. Amounts fit in `uint256`; deadlines are positive. | `validateWithdrawAmount`, `validateWithdrawShares`, `validateRepayAmount`, `validateRepayShares` (Blue entity), `MidnightRedeemExceedsCreditError`, `validateUint256Field`, `validateDeadline`. |

Each invariant has tests tagged with its ID (for example `describe("[INV-01] Deposit routing", …)`), mainly in [`packages/morpho-sdk/src/securityInvariants.test.ts`](./packages/morpho-sdk/src/securityInvariants.test.ts) and also in the entity and requirement tests that exercise the call sites. Any `packages/**/*.test.ts` may carry a tag; a tagged test fails if the guard it covers is removed. `pnpm lint` runs [`scripts/lint/security-invariants.ts`](./scripts/lint/security-invariants.ts), which fails when an ID in this table has no tagged test or a test tags an ID missing from this table. To add an invariant, add a row with the next ID and a tagged test in the same PR.

Two architectural rules from [`AGENTS.md`](./AGENTS.md) also carry security weight:

- **Action-layer purity (§1).** Transaction builders do no network reads, clocks, randomness or signing, and every returned `Transaction` is deep-frozen. What `buildTx` returns depends only on its arguments.
- **Typed failures (§2, §3).** SDK source must not throw a bare `Error`: each failure mode should be a named, exported class so integrators can handle it explicitly. Some older code in `blue-sdk-viem` and `wdk-protocol-lending-morpho-evm` still throws bare `Error`s.

## Supported versions

Security fixes ship only in the latest major line of each maintained package. Previous majors stay installable on npm but receive no fixes; upgrade to the latest major.

| Package | Supported |
| --- | --- |
| `@morpho-org/morpho-sdk` | Latest major |
| `@morpho-org/blue-sdk` | Latest major |
| `@morpho-org/blue-sdk-viem` | Latest major |
| `@morpho-org/morpho-ts` | Latest major |
| `@morpho-org/midnight-sdk` | Latest major |
| `@morpho-org/evm-simulation` | Latest major |
| `@morpho-org/wdk-protocol-lending-morpho-evm` | Latest major |
| `@morpho-org/liquidity-sdk-viem` | Deprecated; no fix guaranteed |
| `@morpho-org/test`, `@morpho-org/morpho-test` | Test utilities; not covered |
| `@morpho-org/consumer-sdk` | Not maintained in this repository |

When a new major is released, the previous major stops receiving fixes. Packages are deprecated following [ADR-2026-05-13](./docs/adrs/ADR-2026-05-13-sdk-package-deprecation-lifecycle.md). The latest major is the one tagged `latest` on npm (`npm view <package> version`); each package's `CHANGELOG.md` lists its releases.

## Release integrity and verification

Packages are released with [Changesets](https://github.com/changesets/changesets) from the `main` (stable) and `next` (prerelease) branches ([ADR-2026-05-12](./docs/adrs/ADR-2026-05-12-release-pr-publish-on-push.md)):

1. Merging to `main` or `next` runs [`push.yml`](./.github/workflows/push.yml). After lint, build and tests pass, [`version-pr.yml`](./.github/workflows/version-pr.yml) opens or refreshes a release PR with GitHub-signed version commits.
2. Merging the release PR runs [`publish.yml`](./.github/workflows/publish.yml):
   - an unprivileged **Build & pack** job installs dependencies, builds every package and packs the tarballs, with read-only permissions;
   - a privileged **Publish** job, in the `prod` GitHub environment and the only job with `id-token: write`, takes those tarballs as untrusted input. It installs nothing, re-checks their digests, checks each tarball's name and version against the source tree with npm's own manifest reader, rejects entries that would collide on a consumer's filesystem, and pins `publishConfig` to the npm registry;
   - it then runs `npm publish --provenance --ignore-scripts` with **npm trusted publishing (OIDC)**. No long-lived npm token is stored for publishing.
3. Package git tags and GitHub releases are created only after npm accepts the publish.

[`.github/workflows/AGENTS.md`](./.github/workflows/AGENTS.md) and [`AGENTS.md`](./AGENTS.md) §10 hold the rules these workflows must keep, including "Artifact identity: ask the consumer, don't emulate it". Changes under `.github/` and to `.changeset/config.json` need review from `@morpho-org/security` ([`CODEOWNERS`](./.github/CODEOWNERS)).

### Verifying a release

Every version published by this pipeline carries an SLSA provenance attestation signed through Sigstore, tying it to the commit and workflow that built it.

`npm audit signatures` checks registry signatures, and provenance attestations where they exist, for an npm-installed `node_modules` tree. It does not fail on a version that has no provenance and does not show which repository built it. pnpm and Yarn have no equivalent command.

To check where a version was built, read the subject of its provenance attestation. Set `VERSION` to the version you want to check:

```bash
VERSION=6.4.0
curl -s "$(npm view "@morpho-org/morpho-sdk@$VERSION" dist.attestations.url)" \
  | jq -r '.attestations[] | select(.predicateType | test("slsa")) | .bundle.dsseEnvelope.payload' \
  | base64 -d | jq '.predicate.buildDefinition.externalParameters.workflow'
```

The output should show `"repository": "https://github.com/morpho-org/sdks"` and `"path": ".github/workflows/push.yml"`, on `refs/heads/main` (or `refs/heads/next` for prereleases). This command only decodes the attestation: it does not verify the Sigstore signature or check that the attestation belongs to the published tarball. For an authenticated check, use `npm audit signatures` on an npm-installed tree or the "Provenance" panel on the package's npmjs.com page, which shows the same information after npm has verified it. Treat a version without provenance, or with provenance from another repository or workflow, as suspect and report it.

## Dependency policy

- **Lockfile.** `pnpm-lock.yaml` is committed and CI installs with `pnpm install --frozen-lockfile`.
- **Minimum release age.** pnpm refuses dependency versions published less than 3 days ago (`minimumReleaseAge: 4320`, `minimumReleaseAgeStrict: true` in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml)). The only exception is a critical-severity security fix, under the rules in [`AGENTS.md`](./AGENTS.md) §7.
- **Peer dependencies.** `viem` is a peer dependency, so integrators control its version. Several packages also take sibling `@morpho-org/*` packages as peers; the exact ranges are in each `package.json`.
- **Caret ranges.** Runtime dependencies, including `@morpho-org/*` ones, may use caret ranges so coordinated patch and minor releases reach consumers without a release per upstream patch. Cantina flagged this in 2025 ([audit](#audits-and-assurance), finding 3.1.1); we accepted it and rely on consumer lockfiles, release age and provenance instead.
- **New dependencies.** A new runtime dependency needs a written justification in its PR and is reviewed as high risk ([`AGENTS.md`](./AGENTS.md) §2 and §10).
- **Updates.** Dependency maintenance and security bumps are automated and opened as PRs that go through the same review and checks as any other change. [`.github/dependency-maintenance.json`](./.github/dependency-maintenance.json) records any update deliberately postponed and why.

### Recommendations for consumers

- Commit your lockfile and install with `npm ci` or `pnpm install --frozen-lockfile` in CI.
- Run `npm audit signatures` after installing with npm, and check provenance of new `@morpho-org/*` versions as described in [Verifying a release](#verifying-a-release).
- Pin `@morpho-org/*` to exact versions, or use `overrides` / `resolutions` for transitive ones, if you need stricter control.
- Watch this repository's [releases](https://github.com/morpho-org/sdks/releases) and [security advisories](https://github.com/morpho-org/sdks/security/advisories) to learn about fixes.

## Audits and assurance

### External audits

| Date | Firm | Scope | Findings | Report |
| --- | --- | --- | --- | --- |
| 2025-05-20 to 2025-06-02 | Cantina (Cantina Managed) | `morpho-org/sdks` at commit `3ba8fd4a` | 0 critical, 0 high, 1 medium, 11 low, 5 informational. 8 fixed, 9 acknowledged. The medium (caret version ranges) was acknowledged; see [Dependency policy](#dependency-policy). | [`audits/2025-06-26-morpho-sdks-cantinacode.pdf`](./audits/2025-06-26-morpho-sdks-cantinacode.pdf) |

Since then, Cantina has reviewed the monorepo on an ongoing basis. Its findings are fixed in place and named in package changelogs ("Cantina finding …"), and findings closed as out of scope are recorded in [`THREAT_MODEL.md`](./THREAT_MODEL.md). Every major release also gets a Cantina audit, with the public report linked from its changelog entry ([`AGENTS.md`](./AGENTS.md) §7).

### Continuous checks

- **Automated PR review.** Every non-draft PR from a branch in this repository (except Dependabot's) is reviewed automatically by Claude through [`claude.yml`](./.github/workflows/claude.yml), using the review personas in [`.agents/pr-review-engine/agents/`](./.agents/pr-review-engine/agents/). The security-focused ones are [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (transaction parameters, permits, Action-layer purity, the invariants above), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (swallowed errors) and, for CI and release changes, [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md).
- **Workflow audit.** [`zizmor.yml`](./.github/workflows/zizmor.yml) audits every GitHub Actions workflow on each PR and uploads findings to code scanning.
- **Pinned actions.** Third-party GitHub Actions are pinned to full commit SHAs and run with least-privilege `permissions:`.
- **Release monitoring.** [`npm-release-watch.yml`](./.github/workflows/npm-release-watch.yml) checks npm every 10 minutes for new `@morpho-org/*` publishes and opens an issue for each so it can be matched against an expected release.
- **Fork tests.** Contract round-trips are tested against Anvil forks at pinned blocks, not mocks ([`AGENTS.md`](./AGENTS.md) §5).

## Secure usage for integrators

- **Check requirements before building.** Call `getRequirements()` and satisfy every approval, permit and authorization it returns before calling `buildTx()`. Calling `buildTx()` directly skips the SDK's RPC-backed pre-flight checks ([`morpho-sdk` README](./packages/morpho-sdk/README.md#how-it-works)).
- **Handle typed errors explicitly.** Catch the specific error classes you expect and let others propagate. Never catch a validation error (for example `ChainIdMismatchError`, `ExcessiveSlippageToleranceError`, `ExpiredDeadlineError`) and retry with the check removed.
- **Do not edit built transactions.** Returned transactions are deep-frozen. Do not copy and change `to`, `data` or `value`; build a new one with new inputs.
- **Set `userAddress` to the real submitter.** Bundles act on `msg.sender`, and signature helpers verify the signer, so `userAddress` must be the account that signs and sends.
- **Keep slippage and deadlines tight.** Use the smallest slippage tolerance your flow can tolerate (the SDK caps it at 10%) and short deadlines for signature-based operations.
- **Send `value` only for native flows.** Native amounts are wrapped into the chain's wrapped native token, and the SDK rejects them for any other asset. Do not add `value` to a transaction the SDK built without it.
- **Sign only what you built.** Present permit and Permit2 signatures produced by the SDK for the transaction you are about to send, and do not reuse them across chains or spenders.
- **Simulate before broadcasting.** Run the bundle through [`@morpho-org/evm-simulation`](./packages/evm-simulation) and show the user the balance changes. A simulation is only as honest as its backend ([`THREAT_MODEL.md`](./THREAT_MODEL.md)).
- **Use RPC endpoints you trust,** and pair each client with the transport for the same chain. The SDK cannot detect a lying node.
- **Register custom addresses once, at startup.** `registerCustomAddresses` rejects overrides of existing entries; treat the addresses you register as part of your trusted configuration.

## Keeping this document accurate

This file summarizes rules that live elsewhere. When one of these changes, update this file in the same PR:

- [`AGENTS.md`](./AGENTS.md) §1 (Action-layer purity), §2 (forbidden patterns), §5 (security invariants), §7 (releases and audits) and §10 (CI and release security);
- [`THREAT_MODEL.md`](./THREAT_MODEL.md);
- the release workflows under [`.github/workflows/`](./.github/workflows/);
- the package list and supported majors.
