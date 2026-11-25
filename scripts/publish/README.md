# npm promotion and rollback holds

On `main`, the release planner promotes an **existing stable version** to `latest`
when npm's `next` tag points at that exact version, `latest` is older and npm's
`versions[version].dist.integrity` matches the SHA-512 of the verified release
tarball. It does not republish the tarball or change `next`. Already-promoted
versions and older release reruns are skipped, without moving `latest` backward.

Missing integrity metadata or different bytes stops the whole plan before any
tag moves or uploads. This includes an old or non-reproducible build of the same
version: matching version strings are not enough. Inspect the published bytes
and release a new version if they differ; there is no integrity bypass.

Other existing versions ahead of their channel still fail closed. In particular,
the planner does not infer historical `next` membership once `next` has moved on.
Prereleases are never promoted to `latest`; `next` releases keep their existing
publish and rollback protections.

## Protect an intentional rollback

The tags alone cannot distinguish a pending promotion from a completed promotion
followed by a rollback. **A manual `npm dist-tag add ... latest` alone is not a
durable rollback hold.** Record the intent in `npm-tag-rollbacks.json`:

```json
{
  "@morpho-org/blue-sdk": {
    "version": "8.2.0",
    "reason": "Hold while investigating a regression in 8.2.1"
  }
}
```

1. Land the pin in the internal repository and include it in the next public
   `main` release snapshot. The release will fail safely if npm does not yet match
   the pinned version. Pin-only commits do not trigger a snapshot by themselves.
2. Apply the rollback manually, then rerun that release:
   `npm dist-tag add @morpho-org/blue-sdk@8.2.0 latest`.
3. Cancel any older queued releases and do not rerun releases whose snapshot
   predates the pin: each run reads the configuration from its own commit.
4. Remove the pin in a later release snapshot to resume promotion or publishing.

Before enabling this automation, migrate any existing intentional rollbacks to
pins. While a pin is active, the package's `latest` tag must already equal the
published pinned version; automation never applies the rollback itself. The
release version must also already exist on npm, otherwise the whole release
fails rather than publishing dependents against a missing version. Other
packages can still release, and the `next` channel ignores `latest` holds.
Malformed pins, unknown packages on `main`, unavailable registry data and
unpublished versions fail the full plan before any npm mutations.

## CI setup

`setup-npm.ts` downloads npm **11.21.2**, verifies its reviewed SHA-512 digest,
then extracts its bundled distribution. It runs no install scripts and installs
no dependencies. The workflow's bundled npm 11.20.0 supports OIDC publishing but
not OIDC dist-tag operations. Both identity verification and publishing use the
same newly configured npm installation.

For every package, the trusted publisher for `morpho-org/sdks`, `release.yml`,
environment `npm`, must permit **Allow npm dist-tag** as well as direct
publishing. Tag access is separately opt-in; existing publishers do not gain it
automatically. Keep the environment's branch restrictions and disabled administrator bypass;
required reviewers are optional for both `main` and `next`.
Do not introduce a stored npm token.

The workflow writes two plans only after the full release set passes:
`to-publish.tsv` for new tarballs and `to-promote.tsv` for existing versions.
Promotions execute first, using `npm dist-tag add <name>@<version> latest`.
An authorization failure stops before new uploads; after a partial failure,
a rerun skips completed promotions and retries the rest.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/#managing-dist-tags-with-trusted-publishing),
[npm dist-tag](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag).
