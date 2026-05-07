---
"@morpho-org/morpho-sdk": patch
---

Republish to fix a broken `1.2.0` manifest. The `1.2.0` tarball on npm was published manually with `npm publish` from the pnpm workspace, which does not rewrite the `workspace:^` protocol. The published `package.json` therefore declared its internal Morpho dependencies as `workspace:^`, breaking installs for consumers that don't understand the workspace protocol (notably Yarn v1). `1.2.1` has identical source to `1.2.0` and is republished via `pnpm publish` so the workspace ranges are resolved to real semver.
