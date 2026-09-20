# TIB-2026-09-20: npm supply-chain monitoring for `@morpho-org` packages

| Field      | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| **Date**   | 2026-09-20                                                  |
| **Author** | @Foulks-Plb                                                 |
| **Scope**  | Repo-wide (release pipeline + every public `@morpho-org/*`) |

## Context

The ten public `@morpho-org/*` packages ship `lib/` only, declare almost no runtime
dependencies, have no install scripts, and are published by `publish.yml` through an
unprivileged `pack` job and a privileged `publish` job using npm trusted publishing
(OIDC provenance, `--ignore-scripts`, pinned action SHAs, `sha256sum --strict` on the
artifact handed between jobs). The dependency tree is barely an attack surface; the
realistic threats are (a) a release that did not come from this pipeline (stolen token,
maintainer account, or npm-side change), (b) a release that did come from the pipeline
but carries content the pipeline never intended to ship (compromised build step,
malicious PR that lands a `postinstall` or a new dependency), and (c) namespace drift
on npm (dist-tags, deprecations, maintainers, new scoped packages) that nobody watches.

Today none of these is checked against a *reviewed* expectation. The publish job checks
that tarballs are structurally sane and match the workspace, but "sane" is not
"expected": a package could grow a `bin`, a new runtime dependency or a non-`lib` file
and publish without anyone signing off on that specific change. SDK-1264 reviews the
whole monitoring architecture; this brief records the first, in-repo decision.

## Goals / Non-Goals

**Goals**

- A publish cannot ship anything not enumerated in a reviewed, versioned policy:
  files, install-time lifecycle scripts, `bin`, bundled deps, install-time
  dependencies, repository URL.
- The check is deterministic, runs on the exact bytes to be published, and fails
  closed before `npm publish` in the privileged job.
- Adding a package, file or dependency to what we ship is a visible, code-owned diff.

**Non-Goals**

- Detecting rogue publishes that bypass this pipeline. That needs an *external*
  monitor with out-of-band expected state (npm namespace watch, provenance/attestation
  verification, tarball archive); it is tracked in SDK-1264 and must not live only in
  this repository, since a compromised repository could rewrite its own expectations.
- Vulnerability or malware intelligence on dependencies (OSV, Socket). Same monitor.
- Any automatic npm remediation (`npm deprecate`, dist-tag rollback). Humans only.
- Letting an AI agent decide or downgrade a verdict. AI may summarize and explain
  deterministic findings; it never is the scanner.

## Decision

A reviewed, versioned **release policy** committed in this repository is the single
source of truth for what a published `@morpho-org/*` tarball may contain. A deterministic
verifier evaluates every packed tarball against it twice in the publish workflow: once in
the unprivileged packing job (early, cheap signal) and once in the privileged publishing
job after the artifact digest check and immediately before `npm publish` (the gate that
matters).

The policy is an allowlist:

- **Files.** Every regular file in the tarball must match a default entry
  (`package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `lib/**`) or a per-package
  extra (today only `bare.js` for `wdk-protocol-lending-morpho-evm`). Entries outside
  `package/` and non-canonical paths (`..`, `.` or empty segments, which npm would
  resolve outside the directory they appear under) are rejected.
- **Manifest.** No `preinstall`/`install`/`postinstall`/`prepare` family scripts
  (repo-only scripts such as `build`, `test`, legacy `prepublish` are inert for
  consumers and stay allowed), no `bin`, no `bundle(d)Dependencies`, `repository` URL
  in the allowed set.
- **Dependencies.** Every name under `dependencies`, `optionalDependencies` and
  `peerDependencies` must be in the package's `dependencies` allowlist.
- **Coverage.** Every non-private workspace package must have a policy entry, and every
  tarball must name a listed package. A new package cannot be published before its
  policy is reviewed.

The policy is not derived from `package.json` at run time: it is a separate file a
reviewer must change on purpose. The policy and the verifier are both code-owned by
`@morpho-org/sdk-engineers` **and** `@morpho-org/security` (the workflow wiring under
`.github/` is already `@morpho-org/security`-owned), so widening the policy or weakening
the verifier is a dual-code-owned diff. The verifier is self-contained: it imports no
helper outside that dual-owned set, so a change elsewhere in the repository cannot make it
fail open.

## Invariants

- `npm publish` never runs on a tarball that failed the policy check in the same job.
- The publish-job check operates on the downloaded artifact bytes that passed
  `sha256sum --check --strict`, never on a re-pack.
- A violation is a hard failure. No warn-only mode, no environment flag to bypass.
- Widening the policy requires a diff to the policy file in a dual-code-owned PR.
- The verifier reads tarball metadata and the packed manifest only; it never extracts
  package contents to disk, executes them, or adds a runtime dependency.

## Rejected alternatives

- **Derive expectations from each `package.json` at publish time.** Rejected: the
  manifest is the thing under attack; a malicious PR editing `package.json` would move
  the goalposts with it. A separate policy file makes the change a second, visible diff.
- **Reject any `scripts` field in the packed manifest.** Rejected: `pnpm pack` keeps
  `scripts` (the previous workflow comment claiming otherwise was wrong), so this would
  block every release. Only install-time hooks reach consumers; those are rejected.
- **Put the gate in the external monitor only.** Rejected: post-publish detection
  cannot unpublish. The in-repo gate is cheap and prevents; the monitor detects what
  the gate cannot see.
- **Run the check only in the unprivileged `pack` job.** Rejected: the privileged job
  must not trust upstream job state beyond the digest; it re-runs the check itself.

## Acceptance Criteria

- [ ] The publish workflow runs the verifier in both the packing and the publishing job,
      the latter after digest verification and before `npm publish`.
- [ ] The policy lists every public workspace package, and a public package added
      without a policy entry fails verification.
- [ ] Each of these is rejected, and a test fails if it stops being rejected:
      non-allowlisted file, non-canonical path, entry outside `package/`, install
      lifecycle script, `bin`, bundled dependencies, non-allowlisted dependency in any
      installed field, unexpected repository URL, unlisted package.
- [ ] The verifier and the policy are both owned by `@morpho-org/sdk-engineers` and
      `@morpho-org/security` in `CODEOWNERS`, and the verifier imports nothing outside
      that dual-owned set.
- [ ] Every current public package, built and packed as the release pipeline does,
      passes the verifier unchanged.

## Consequences

- Adding a runtime/peer dependency or a shipped non-`lib` file now requires a release
  policy change in the same PR. This is intended friction.
- The external monitor (namespace watch, provenance verification, dependency intel,
  archive) remains open in SDK-1264 and should reuse this policy file as one of its
  out-of-band pinned inputs.

## References

- [SDK-1264](https://linear.app/morpho-labs/issue/SDK-1264)
- [TIB-2026-05-12: release PR publish on push](./TIB-2026-05-12-release-pr-publish-on-push.md)
