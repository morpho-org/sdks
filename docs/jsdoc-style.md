# JSDoc style guide

This guide is the canonical shape for JSDoc on every exported symbol in this monorepo. It is the operational form of the rule in [`AGENTS.md`](../AGENTS.md) §6 and the AI-legibility commitment in [`MISSION.md`](../MISSION.md) goal #3.

The guide is repo-wide. Every package follows it. Per-package `AGENTS.md` files link here rather than restating the rules.

> Background and rollout sequence: [`docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md`](./tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md).

---

## What needs JSDoc

Every symbol re-exported from a package's `src/index.ts`:

- Functions and methods (including class methods, getters, static methods).
- Classes.
- Interfaces, type aliases, and discriminated unions.
- Constants.

Symbols that **do not** need JSDoc:

- Anything marked `@internal`.
- Anything not re-exported from `src/index.ts`.
- Test fixtures and helpers under `morpho-test`, `test`, `test-wagmi`.
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
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Loan asset amount to borrow, in the loan token's smallest unit.
 * @param params.args.receiver - Address that receives the borrowed assets.
 * @param params.args.minSharePrice - Minimum borrow share price (in ray). Slippage protection.
 * @param params.args.reallocations - Optional vault reallocations to execute before borrowing.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 */
```

If a parameter is optional, mark it in the description (`Optional…`) rather than the `@param` tag.

### 4. `@returns`

Describes the **shape** of the return, not just the type name.

For action builders, name `Readonly<Transaction<TAction>>` and call out that the result is `deepFreeze`d:

```ts
/**
 * @returns A deep-frozen `Transaction<MarketV1BorrowAction>` with `to`, `value`, `data`, and the
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
 * @throws {NonPositiveBorrowAmountError} when `amount <= 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minSharePrice < 0n`.
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
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { MorphoClient } from "@morpho-org/morpho-sdk";
 *
 * const client = new MorphoClient(
 *   createWalletClient({ chain: mainnet, transport: http(), account: borrower }),
 * );
 *
 * const market = client.marketV1(marketParams, 1);
 * const positionData = await market.getPositionData(borrower);
 * const { buildTx } = market.borrow({
 *   userAddress: borrower,
 *   amount: 1_000_000n,
 *   positionData,
 * });
 * const tx = buildTx();
 * // tx satisfies Readonly<Transaction<MarketV1BorrowAction>>
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
export const marketV1Borrow = (params: MarketV1BorrowParams) => { … };
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
 * Prepares a borrow transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `morphoBorrow`. The bundler uses the transaction initiator as
 * `onBehalf`. Uses `minSharePrice` to protect against share price manipulation between
 * transaction construction and execution.
 *
 * When `reallocations` are provided, `reallocateTo` actions are prepended to the bundle, moving
 * liquidity from other markets via the PublicAllocator before borrowing. Reallocation fees
 * accumulate in `tx.value`.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Loan asset amount to borrow, in the loan token's smallest unit.
 * @param params.args.receiver - Address that receives the borrowed assets.
 * @param params.args.minSharePrice - Minimum borrow share price (in ray). Slippage protection.
 * @param params.args.reallocations - Optional vault reallocations to execute before borrowing.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1BorrowAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {NonPositiveBorrowAmountError} when `amount <= 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minSharePrice < 0n`.
 * @example
 * ```ts
 * import { marketV1Borrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Borrow({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000n,
 *     receiver: borrower,
 *     minSharePrice: 0n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1BorrowAction>>
 * ```
 */
```

The two cited reference exemplars in this repo are:

- `packages/morpho-sdk/src/actions/marketV1/borrow.ts` — `marketV1Borrow` (action builder).
- `packages/morpho-sdk/src/actions/vaultV1/deposit.ts` — `vaultV1Deposit` (action builder with nested options bag, including the `nativeAmount` branch).

Copy from those files when in doubt.

---

## Operational rules

- **One concern per PR** ([`AGENTS.md`](../AGENTS.md) §8): JSDoc backfill PRs do not mix in feature work or refactors.
- **Doc-only changesets** are `patch` per [`AGENTS.md`](../AGENTS.md) §7 when the PR's behavior-affecting changes touch a published package. JSDoc-only changes inside `packages/*/src/` — and repo-meta-only PRs (TIB, style guide, root tooling) — may omit a changeset.
- **Coverage is observable**: run `pnpm jsdoc:coverage` to print the per-package burndown table. Backfill PRs paste the new table into their PR description so reviewers see progress without reading the diff.
- **Automated enforcement is deferred** — see [TIB-2026-05-04](./tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) Considered Alternative 6. Reviewers and the burndown signal hold the line until Biome ships JSDoc rules (or a lighter in-repo gate emerges).
