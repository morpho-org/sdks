# wdk-protocol-lending-morpho-evm Conventions

- This package adapts WDK EVM accounts (`@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`) to `@morpho-org/morpho-sdk`. Every transaction comes from an SDK action's `buildTx`; the adapter never encodes calldata, permits or signatures itself. Background and phases: [`ADR-2026-05-18-wdk-protocol-lending-morpho-evm-migration`](../../docs/adrs/ADR-2026-05-18-wdk-protocol-lending-morpho-evm-migration.md).
- **Vault V2 only.** Earn presets and supported vault targets are Morpho Vault V2. Do not add Vault V1 (MetaMorpho) presets or V1 entity/action paths; the package's V2-only check must keep failing when one is added.
- **WDK private fields.** WDK does not expose everything the adapter needs, so it reads private account fields with `Reflect.get`: `_config`, `_provider`, `_chainId`, `_signUserOperation`, `_getSmartAccount`. Treat these as fragile upstream types: read them as `unknown`, check their shape, fail closed with a typed error when one is missing or changed, and re-check them when bumping the pinned WDK versions. Exception: see [docs/EXCEPTIONS.md](../../docs/EXCEPTIONS.md#wdk-private-field-validation-gap).
- **Chain safety.** Re-validate the chain after each read, around ERC-4337 signing, before EOA broadcast, and on the signed transaction's chain id. Explicit vault or market targets require a `chainId`. Accepted RPC trust gaps are recorded in the root [`THREAT_MODEL.md`](../../THREAT_MODEL.md) (RPC section); reference it rather than restating them.
- **Wallet-only recipients.** `onBehalfOf` and `to` must equal the wallet address; keep new flows to that rule.
- **Per-process EOA send queue.** EOA sends are serialized per chain and address in a module-level queue so concurrent sends don't reuse the same pending nonce. It is the only module-level mutable state allowed here: entries are removed when they settle, and it must not carry data between `getRequirements`/`sign` and `buildTx`.
- **Errors.** Every failure throws an exported, named class from `src/errors.ts` or a reused `morpho-sdk` class, re-exported from `src/index.ts`.
- **License.** Apache-2.0, unlike the rest of the monorepo; keep `LICENSE` and `package.json#license` as they are (see [docs/EXCEPTIONS.md](../../docs/EXCEPTIONS.md#wdk-apache-20-license)).

## Tests

- Unit tests are colocated `src/*.test.ts` and use a mocked transport. Fork tests live in `test/*.integration.test.ts`, run on Anvil forks through `@morpho-org/test`, and must skip when `ERPC_SECRET` is unset (`describe.skipIf(!process.env.ERPC_SECRET)`).
