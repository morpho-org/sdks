# ADR-2026-11-04: An independent App gates npm publishing on internal provenance

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| **Date**   | 2026-11-04                                             |
| **Author** | @Foulks-Plb                                            |
| **Scope**  | Repo-wide                                              |

_Frozen after merge; only superseded-by entries in References change._

## Context

The public `morpho-org/sdks` repository is a generated mirror of the internal SDK repository. A sync GitHub App
pushes each release commit to public `main` or `next`, fast-forward only, with `Source-Commit:` and `Public-Tree:`
trailers. Its token has contents and workflows write, so whoever holds its private key can change any public file,
including `.github/workflows/release.yml`, and push a commit that GitHub signs as the App. The public `publish` job
then runs in the `npm` environment, and npm provenance names only the public repository and workflow, never the
internal commit. One human npm approval is the only remaining control; it does not show what the internal pipeline
produced.

A check placed inside public `release.yml` protects nothing against that key, because the same key can delete it.
The check has to run where the sync App has no authority and has to rely on evidence the sync App cannot produce.

GitHub custom deployment protection rules provide that seat. When a job references an environment with the rule
enabled, GitHub sends a `deployment_protection_rule` webhook to a GitHub App, and the job waits until the App posts
`approved` or `rejected` to the run. According to GitHub's documentation at the time of writing:

- The App needs repository `Deployments: read and write` and `Actions: read`, and subscribes to the deployment
  protection rule event. It acts through an installation token, so it needs a reachable HTTPS webhook endpoint and
  its own private key.
- The rule is available on public repositories on every plan; Morpho's organization is on GitHub Enterprise. Up to
  six rules can be enabled per environment. The feature is in public preview.
- A repository admin enables the rule in the environment's settings. Repository admins can bypass protection rules
  unless the environment disallows bypassing.
- A job waiting on a rule is not approved by default; it stays waiting until the App answers or GitHub's environment
  wait limit (30 days) fails the job.

The internal repository can produce signed evidence through GitHub artifact attestations. In a private repository
they are signed with an ephemeral key from GitHub's own Sigstore instance, which federates only with GitHub Actions
and keeps no public transparency log. Signing needs the job to request `id-token: write` and `attestations: write`.
The internal workflow policy today forbids `id-token: write` in every internal workflow, so that npm trusted
publishing has exactly one OIDC path.

## Decision

- **The public `npm` environment requires a custom deployment protection rule served by a dedicated provenance-gate
  GitHub App.** The gate approves a deployment only when it verifies an attestation, produced by the internal
  snapshot workflow on protected `main` or `next`, for the exact public commit and tree being deployed. It rejects
  every other deployment, and it never approves by default.
- **Four trust domains hold separate credentials.** None of them can act for another.

  | Domain | Holds | Can | Cannot |
  | -- | -- | -- | -- |
  | Internal source | Protected internal `main`/`next`, the snapshot workflow and its attest job's OIDC identity | Sign attestations for trees it produced | Write the public repository or approve deployments |
  | Sync | Sync App key, scoped to public contents and workflows | Push fast-forward release commits | Sign attestations, approve deployments, change environments, rulesets or Apps |
  | Gate | Gate App key and its host | Read public runs, internal attestations; approve or reject `npm` deployments | Write any repository content, change settings, publish to npm |
  | Administration | Organization and repository admins, npm package owners | Install Apps, enable or disable the rule, configure trusted publishers | Approve deployments; their setting changes must reach the drift monitoring this design requires, which is not live today |

- **The attestation names the exact public commit, so it is signed after staging and before the branch moves.**
  The sync already builds each release as GitHub-signed commits on a `sync/build` staging branch, then fast-forwards
  `main` or `next` to the last one. The internal snapshot workflow is split so that, between those two steps, a
  separate attest job with no sync token reads the staged head, checks that it descends from the expected public tip
  only through this release's commits and that its tree equals the tree the internal job generated, and signs. The
  sync then fast-forwards the branch to exactly that commit, so the attestation exists before the public release
  workflow starts. Its subject is the SHA-256 of the 40-character public commit ID; whether GitHub's attestation store
  accepts a Git commit digest directly is unverified. Its predicate, of type
  `https://morpho.org/attestations/public-release/v1`, records:
  - `publicCommit`: the staged head the branch will point to; for a release split into several `(part N/M)` commits,
    the last part.
  - `publicTree`: that commit's Git tree ID.
  - `publicBase`: the public branch tip the release fast-forwards.
  - `sourceCommit`: the internal release commit the tree was generated from.
  - `targetBranch`: `main` or `next`.
  - `packages`: the `name@version` list the release publishes.
- **Identity comes from the signing certificate, never from the predicate or the commit message.** The gate accepts
  an attestation only when its certificate shows, by exact match: GitHub Actions as OIDC issuer, the internal
  repository as source, the snapshot workflow file at `refs/heads/<targetBranch>` as signer workflow and source ref,
  `sourceCommit` as source digest, a `push` trigger, and a GitHub-hosted runner. Signatures verify against GitHub's
  Sigstore trust root, pinned in the gate and updated only by a reviewed change to the gate.
- **The gate binds the attestation to the deployment it is asked about.** From the waiting run it reads the
  repository, workflow path, event, branch and head commit through the API. It approves only when all of these hold:
  the run is the public `release.yml` on `push`; the run's branch equals `targetBranch`; the run's head commit equals
  `publicCommit` and its tree equals `publicTree`; `publicCommit` is on the first-parent history of the public
  `targetBranch`, read when the gate decides; and the commit's `Source-Commit:` and `Public-Tree:` trailers equal the predicate.
  Trailers are only cross-checked: a mismatch rejects, a match proves nothing.
- **The threats this binding answers:**
  - *Forged trailers:* trailers are written by the sync key holder, so they are never evidence.
  - *Untrusted workflows:* an attestation from another internal workflow, another branch, a pull request, a
    reusable-workflow call or a self-hosted runner fails the certificate identity.
  - *Branch mismatch:* a `next` attestation cannot approve a `main` deployment, and the reverse.
  - *Replay and reruns:* an attestation matches one public commit, and the gate approves it only while that commit
    is on its branch's first-parent history. Public `release.yml` queues every push in order, so a release still
    waiting when a newer one lands must stay publishable. A commit taken off the branch, or from another branch, is
    rejected. A rerun of an older release is approved, but it runs that commit's own attested `release.yml`, whose
    publish plan fails before upload when it would move a dist-tag back.
  - *Mutable refs:* the gate reads the branch only to check that the commit is still on it; every approval compares
    fixed commit IDs from the run and the certificate.
  - *Signing-key compromise:* there is no long-lived signing key to steal. Forging an attestation means running the
    snapshot workflow on protected internal `main` or `next`, which is the internal source domain's own controls.
  - *Gate key compromise:* it lets an attacker approve a deployment, but not change public content or the npm
    approval. It is rotated in the App's settings; no alert specific to it exists yet.
- **The gate fails closed.** A missing or late attestation, an API error, an unverifiable signature or a crash posts
  `rejected` or leaves the job waiting; nothing approves on error. The gate may retry briefly while an attestation
  becomes visible, then rejects with a short public reason that names only public IDs. A rejected release is retried
  by re-running the public workflow once the cause is fixed; publishing stays idempotent.
- **Rollback is an admin action, never a mode of the gate.** A prolonged gate outage blocks releases. Only a
  repository admin can unblock it, by disabling the rule on the `npm` environment, which the required drift
  monitoring must page on, and re-enabling it when the gate recovers. The environment disallows admin bypass, and
  the gate has no allow-all setting. A faulty gate release is rolled back by redeploying the previous gate version.
- **Recommended host and operator: Morpho's existing production infrastructure, operated by a team outside the SDK
  release approvers.** This is a recommendation this ADR asks to accept, not a confirmed arrangement. The gate is a
  small stateless webhook service in its own deployment, with a public HTTPS endpoint that verifies GitHub's webhook
  signature, and its App key lives in a production secret store outside every GitHub repository and environment.
  Changes to its code, deployment or key need approval from its operator, who is neither the version PR merger nor
  the npm approver of a release it gates. Prerequisites, not verified when this was written: a team that agrees to
  operate it, a public ingress for the webhook, and a secret store the SDK release approvers cannot read.
- **Signing needs an exception to the internal no-OIDC policy, which this ADR does not grant.** The narrowest one
  that suffices would let only the attest job of the snapshot workflow, on release commits of `main` and `next`,
  request `id-token: write` and `attestations: write`. That job holds no sync token, installs no dependencies and
  runs only dependency-free scripts and first-party actions, because any code it runs could sign. Whether to grant
  it is decided in the change that updates the workflow policy, the threat model and the review criteria together. Until then the gate cannot be
  enabled, because no attestation exists to verify.
- **Attestations stay private.** They are stored in the internal repository's attestation store, never in the public
  repository or a public transparency log. Their predicate carries only IDs and package versions that the public
  release commit already shows. Gate status reports on the public run never include internal names or URLs.
- **A release needs no new human step.** The version PR merge and the npm approval stay the only two, and the public
  mirror stays fast-forward-only with its trailers.

## Invariants

| # | Must always hold | Check |
| -- | -- | -- |
| `I-1` | Once enabled, the public `npm` environment keeps the provenance-gate rule and disallows admin bypass; it gates `main` and `next` together. | The internal sync's protection check refuses to push while it is missing; drift monitoring pages on any change. |
| `I-2` | The sync App's installation has no Administration, Environments, Deployments or Actions-write permission on the public repository. It stays the only bypass actor of the public `main`/`next` and `sync/*` rulesets, which is how it pushes, and is a bypass actor of no other ruleset and of no `npm` environment protection. | Drift monitoring reads the installation's permissions and every bypass list. |
| `I-3` | The gate approves only a deployment whose head commit is on its branch's first-parent history and equals the `publicCommit` of a verified attestation from the internal snapshot workflow on that protected branch. | Gate tests with one rejected case per threat above, including a commit off the branch, and accepted cases for a multi-part release and a release queued behind a newer one; after enablement, a recorded rejection of an unattested `next` deployment. |
| `I-4` | Every failure path of the gate rejects or waits; none approves. | Gate tests for each API error, timeout and verification failure. |
| `I-5` | No internal workflow requests `id-token: write` beyond what the workflow policy names as an exception. | Workflow lint and the release-path review criteria. |
| `I-6` | No attestation, predicate or gate report published outside the internal repository carries private content. | Review of the predicate schema; the public status-report template names only public IDs. |

## Rejected alternatives

- **Attestation check inside public `release.yml`.** The sync App key can delete the check.
- **Gate on a serverless platform account shared with application deploys.** Feasible. Not chosen on the
  assumption, not verified, that the people who can deploy there or read its secrets include SDK release approvers,
  which would merge the gate and release domains.
- **Gate on the workflow automation server.** Feasible. Not chosen on the assumption, not verified, that its
  workflows can be changed without code review and share credentials with other automations.
- **Gate as a GitHub Actions workflow in another repository, fed by a webhook relay.** It still needs a hosted relay,
  and its App key would sit in a GitHub environment administered by the same organization admins and reachable by
  that repository's writers.
- **Third-party deployment protection services.** Those listed in GitHub's documentation gate on monitoring or
  change-management signals; no survey was made of one that verifies a custom attestation from a private repository.
- **A long-lived signing key in the internal sync environment.** It avoids the OIDC exception, but a leaked key
  forges every attestation, and rotation becomes a manual duty.
- **Run evidence from the Actions API instead of an attestation.** It avoids the OIDC exception, but run records are
  mutable and expire, and reading them needs broader access to the internal repository, logs included.
- **Second required reviewer on the `npm` environment.** It adds a human step to every release and asks a person to
  judge a generated tree by eye.

## References

- [Creating custom deployment protection rules](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/create-custom-protection-rules)
- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [ADR-2026-05-12: Release PR, publish on push](./ADR-2026-05-12-release-pr-publish-on-push.md)
- [Threat model](../../THREAT_MODEL.md)
