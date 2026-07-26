# morpho-test Conventions

- Keep fixtures framework-agnostic; test runners should consume them, not live here.
- Export fixture groups from `src/fixtures/index.ts` through `src/index.ts`.
- Fixture files are static protocol data grouped by entity type: markets, tokens, and vaults.
- Use concrete chain keys, e.g. `markets[ChainId.EthMainnet]`.
- Keep fixture data typed with `blue-sdk` models and IDs.
- Use `parseUnits("94.5", 16)` for LLTV percentages in market fixtures.
- Prefer deterministic, parameterized fixture helpers, e.g. `randomMarket({ loanToken })`.
- Keep token capability sets explicit, e.g. `withSimplePermit[ChainId.EthMainnet]`.

## Fork contract deployments

`src/contracts` hosts contracts that tests deploy onto a fork because they are not yet deployed on
any live chain. Each one is a committed compiler artifact plus a deploy helper.

- Deploy through the CREATE2 proxy at `DETERMINISTIC_DEPLOYER_ADDRESS`, never plain `CREATE`. The
  address must not depend on the deployer's nonce: `registerCustomAddresses` is additive-only and
  throws `RegistryValueAlreadyRegisteredError` when a second call registers a different address for
  the same key, so a nonce-dependent address breaks any test file that deploys more than once.
- Deploy helpers are idempotent — return the existing address when the target already has code.
- Expose the precomputed address too, e.g. `getVaultExitBundlesV1Address`, so tests can resolve the
  address without spending a transaction.
- Artifacts are generated: keep the provenance header, do not hand-edit, and re-export the ABI from
  `src/contracts/index.ts` under an explicit name, e.g. `vaultExitBundlesV1Abi`.
- Delete the artifact and its helper once the contract ships on a live chain and the address lands in
  the registry — these exist only to bridge that gap.

To regenerate an artifact, clone the source repository at the commit pinned in the file's header
(`git clone --recurse-submodules`), then compile the contract and its transitive imports with the
`solc` version and settings recorded in that same header, emitting `abi` and the creation bytecode as
`code`. That is the shape `scripts/compile-solidity.js` emits for in-repo contracts; these artifacts
match it but are compiled from an external repository, so that script does not build them.

## Continuous Improvement

- Keep this package framework-agnostic; runner-specific glue belongs in dedicated test adapter packages.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
