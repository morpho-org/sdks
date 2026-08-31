# JSDoc style guide

This guide is the canonical shape for JSDoc on every exported symbol in this monorepo. It is the operational form of the rule in [`AGENTS.md`](../AGENTS.md) §6 and the AI-legibility commitment in [`MISSION.md`](../MISSION.md) goal #3.

The guide is repo-wide. Every package follows it. Per-package `AGENTS.md` files link here rather than restating the rules.

## What needs JSDoc

Every symbol re-exported from a package's `src/index.ts`:

- Functions and methods (including class methods, getters, static methods).
- Classes.
- Interfaces, type aliases, and discriminated unions.
- Constants.

Symbols that **do not** need JSDoc:

- Anything marked `@internal`.
- Anything not re-exported from `src/index.ts`.
- Test fixtures and helpers under `morpho-test` and `test`.
- Generated outputs (`packages/*/src/api/sdk.ts`, `packages/*/src/api/types.ts`).

## What goes in a JSDoc block, in order

### 1. First sentence

A complete, imperative sentence ending with a period. Describes what the symbol *is* or *does*.

- Functions: imperative ("Prepares a borrow transaction…", "Fetches the market state…").
- Classes and types: declarative ("Represents a lending market on Morpho Blue.").
- Constants: declarative ("WAD scale used for fixed-point rates.").

Do not start with "This function…", "Used to…", or sentence fragments.

### 2. What it reads on-chain (entity layer only)

Required on every entity fetcher; forbidden on actions and pure helpers (per [`AGENTS.md`](../AGENTS.md) §1: actions never read state, helpers are pure).

> "Reads `Morpho.market(id)` and `Morpho.idToMarketParams(id)` in a single multicall."

### 3. `@param`

One `@param` line per parameter. **No inline types** — TypeScript owns the type information; duplicating it in JSDoc creates drift.

For nested options bags, document every leaf field with dot notation. Do **not** collapse them under a single `@param params - The parameters.`

```ts
/**
 * @param params.vault.chainId - The chain the vault lives on.
 * @param params.vault.address - The VaultV1 contract address.
 * @param params.vault.asset - The vault's underlying ERC-20 asset.
 * @param params.args.amount - Asset amount to deposit, in the asset's smallest unit.
 * @param params.args.maxSharePrice - Maximum accepted vault share price, scaled by RAY.
 * @param params.args.recipient - Address that receives the minted vault shares.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 */
```

If a parameter is optional, mark it in the description (`Optional…`) rather than the `@param` tag.

### 4. `@returns`

Describes the **shape** of the return, not just the type name.

For action builders, name `Readonly<Transaction<TAction>>` and call out that the result is `deepFreeze`d:

```ts
/**
 * @returns A deep-frozen `Transaction<VaultV1DepositAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 */
```

For entity fetchers, name the entity class and the `null` cases:

```ts
/**
 * @returns The hydrated `Market` entity, or `null` if the market id is unknown to the protocol.
 */
```

### 5. `@throws`

One `@throws` line per **exported error class** the function may surface, in the order they can fire. Use class identity, not message text — error messages can change without notice; classes are public API per [`AGENTS.md`](../AGENTS.md) §3.

Format: `@throws {ErrorClass} when <condition that triggers it>.`

```ts
/**
 * @throws {NegativeInputError} when `amount < 0n`.
 * @throws {NonPositiveInputError} when `maxSharePrice <= 0n`.
 */
```

If the function can re-throw an error from a downstream call (e.g. an entity fetcher's RPC error), document the class. If the downstream class is from `viem` or another external package, document it qualified (`{viem.BaseError}`).

Adding, renaming, or removing a `@throws` class on an exported function is a breaking change and must follow the §7 deprecation flow.

### 6. `@example`

Exactly one `@example` block per exported function or method. The block contains **runnable** code: imports, client setup, the call, and the expected return shape.

Rules for examples:

- Use named protocol constants and fixture addresses; never embed `0x…` placeholders.
- Use placeholder transports (`http()` with no URL) — never a real RPC URL or API key.
- Never include any private key, even an obviously-throwaway one.
- Show the return type inline so a reader can verify the call without running it.
- Keep the snippet short — one call per example. If multiple call shapes exist, prefer multiple examples on different methods over a kitchen-sink example.

```ts
/**
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() })
 *   .extend(morphoViemExtension());
 *
 * const vault = client.morpho.vaultV1(vaults[mainnet.id].steakUsdc.address, mainnet.id);
 * const vaultData = await vault.getData();
 * const { buildTx } = vault.deposit({
 *   userAddress: zeroAddress,
 *   amount: 1_000_000n,
 *   vaultData,
 * });
 * const tx = buildTx();
 * // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
 * ```
 */
```

---

## Class, type, and constant JSDoc

Classes, interfaces, and type aliases need a short description. Class fields, getters, and methods each get their own JSDoc block.

```ts
/**
 * Represents a lending market on Morpho Blue.
 */
export class Market {
  /** The market's params. */
  public readonly params: MarketParams;

  /** The amount of loan assets supplied in total on the market. */
  public totalSupplyAssets: bigint;
}
```

For exported constants, a one-line description suffices unless the value encodes protocol semantics (LLTV buffers, slippage caps, well-known addresses), in which case explain the units and the source.

```ts
/** Maximum slippage tolerance accepted on bundled paths, scaled by WAD. */
export const MAX_SLIPPAGE_TOLERANCE = 100_000_000_000_000_000n; // 10%
```

---

## Side-by-side: bad vs good

### ❌ Bad

```ts
/**
 * Borrow.
 * @param {Object} params - The borrow parameters.
 * @returns {any} The transaction.
 */
export const vaultV1Deposit = (params: VaultV1DepositParams) => { … };
```

What's wrong:

- Sentence fragment, not imperative.
- Inline types duplicate TypeScript.
- `@param` collapses the nested options bag into a single line.
- `@returns` uses `any` and says nothing about the shape.
- Missing `@throws` and `@example` entirely.

### ✅ Good

```ts
/**
 * Prepares a deposit transaction for a VaultV1 (MetaMorpho) contract.
 *
 * Routed through bundler3 so GeneralAdapter1 atomically transfers the assets and enforces the
 * vault's `maxSharePrice` bound onchain.
 *
 * @param params.vault.chainId - The chain the vault lives on.
 * @param params.vault.address - The VaultV1 contract address.
 * @param params.vault.asset - The vault's underlying ERC-20 asset.
 * @param params.args.amount - ERC-20 asset amount to deposit.
 * @param params.args.maxSharePrice - Maximum accepted share price, scaled by RAY.
 * @param params.args.recipient - Address that receives the minted vault shares.
 * @param params.args.requirementSignature - Optional signed token-pull requirement.
 * @param params.args.nativeAmount - Optional native amount to wrap when the asset is wNative.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<VaultV1DepositAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
 * @throws {NonPositiveInputError} when the total deposit or `maxSharePrice` is non-positive.
 * @throws {ChainWNativeMissingError} when native funding is requested on a chain without a
 *   configured wNative token.
 * @throws {NativeAmountOnNonWNativeVaultError} when native funding is requested for a vault whose
 *   asset is not the chain's wNative token.
 * @throws {DepositAssetMismatchError} when the signed token requirement names a different asset.
 * @throws {DepositAmountMismatchError} when the signed token requirement names a different amount.
 * @throws {Permit2ExpirationMissingError} when a Permit2 requirement signature omits expiration.
 * @example
 * ```ts
 * import { vaults } from "@morpho-org/morpho-test";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { vaultV1Deposit } from "@morpho-org/morpho-sdk";
 *
 * const vault = vaults[mainnet.id].steakUsdc;
 * const tx = vaultV1Deposit({
 *   vault: { chainId: mainnet.id, address: vault.address, asset: vault.asset },
 *   args: {
 *     amount: 1_000_000n,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n,
 *     recipient: zeroAddress,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
 * ```
 */
```

The two cited reference exemplars in this repo are:

- `packages/morpho-sdk/src/actions/vaultV1/deposit.ts` — `vaultV1Deposit` (action builder with a nested options bag and native branch).
- `packages/morpho-sdk/src/actions/vaultV1/withdraw.ts` — `vaultV1Withdraw` (small direct-call action builder).

Copy from those files when in doubt.

---

## Operational rules

- **One concern per PR** ([`AGENTS.md`](../AGENTS.md) §8): JSDoc backfill PRs do not mix in feature work or refactors.
- **Changesets follow semver relevance** per [`AGENTS.md`](../AGENTS.md) §7. JSDoc-only changes to published package source may ship a patch changeset when maintainers want them visible in package release notes. Repo-meta-only PRs (TIB, style guide, root tooling) and tests-only changes do not need a changeset unless they accompany a behavior-affecting published package source change.
- **Coverage is observable**: run `pnpm jsdoc:coverage` to print the per-package burndown table. Backfill PRs paste the new table into their PR description so reviewers see progress without reading the diff.
- **Automated enforcement is deferred** — reviewers and the burndown signal hold the line until Biome ships JSDoc rules or a lighter in-repo gate emerges.
