# morpho-sdk Conventions

The SDK does one thing: build ready-to-send Morpho transactions for VaultV1, VaultV2, and MarketV1. Keep it RPC-only, framework-free, stateless, strict, and explicit.

## Architecture

- Preserve one-way layering: `src/client -> src/entities -> src/actions`; lower layers must not reach back into higher layers.
- `MorphoClient` wraps a viem `Client` + readonly options only; no cache, `init()`, warm-up, background reads, or mutable runtime state.
- Entities perform viem-backed RPC reads, compute derived values, validate `chainId` and `userAddress`, then return lazy `{ buildTx, getRequirements }` handles.
- Actions are pure synchronous transaction builders: `(args) => Transaction`, no network I/O, hidden clock, randomness, or `async`.
- Requirements/signature flows are the only action-adjacent code allowed to read or sign; keep approval, permit, permit2, and Morpho authorization resolution centralized there.

## Public API and Types

- Re-export public API through barrel `index.ts` files; avoid accidental deep-file public surfaces.
- Add JSDoc for exported functions and interfaces, and follow neighboring patterns before introducing abstractions.
- Maintain strict TypeScript with zero `any`; redesign hard-to-type APIs instead of exporting broad or mutable shapes.
- Public fields and types are `readonly`; returned `Transaction` and signature objects are `deepFreeze`d.
- Typed error classes are public API; never throw generic `Error` from SDK source.
- Reuse protocol types such as `Address`, `MarketParams`, `MarketId`, and `bigint` quantities.
- Keep action types discriminated by `type`; new operations extend `TransactionAction` and add dedicated errors in `src/types/error.ts`.

## `src/actions`

- Always validate inputs with dedicated errors before encoding, append metadata only when provided, and deep-freeze the returned transaction.
- Never bypass the general adapter for VaultV1/VaultV2 deposits; it enforces `maxSharePrice` and protects against inflation attacks.
- Vault withdraw/redeem actions are direct vault calls; VaultV2 force withdraw/redeem use VaultV2 `multicall` with one or more `forceDeallocate` calls before the final withdraw/redeem.
- MarketV1 `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, and `repayWithdrawCollateral` route through bundler3 via GeneralAdapter1; `withdrawCollateral` is a direct Morpho call.
- `repay` supports exactly one mode: assets for partial repay or shares for full repay; shares mode uses an upper-bound transfer amount and `maxSharePrice`.
- Preserve `repayWithdrawCollateral` ordering: repay first, then withdraw collateral.
- Native wrapping is only valid for configured wNative assets/collateral; prepend `nativeTransfer` + `wrapNative` and include native value in `tx.value`.
- Shared-liquidity `reallocations` encode `PublicAllocator.reallocateTo()` before borrow execution, validate non-empty positive withdrawals and fees, and add total fees to `tx.value`.
- Requirement encoders are leaf-level and spender-specific: Permit2 and permit flows must verify signatures and must not permit arbitrary spenders when GeneralAdapter1 is required.

## `src/entities`

- Validate `chainId` before every on-chain read and before transaction construction; enforce builder equals signer with `validateUserAddress`.
- Never encode calldata in entities; entities fetch state, compute slippage/health values, and delegate transaction building to actions.
- Vault entities compute deposit `maxSharePrice` from total assets (`amount + nativeAmount`) and keep VaultV1/VaultV2 differences explicit.
- MarketV1 entity keeps LLTV buffer checks explicit for `supplyCollateralBorrow`, `withdrawCollateral`, and `repayWithdrawCollateral`; throw typed errors for missing prices or unsafe positions.
- `withdrawCollateral` has no requirements; `repay` needs loan-token approval only; borrow and repay-withdraw flows need Morpho authorization when routed through GeneralAdapter1.
- `getReallocationData` may fetch the data needed to compute reallocations, but action encoding and reallocation validation stay outside the entity fetch path.

## `src/helpers`

- Helpers stay small, pure, and protocol-specific; return new objects and never mutate inputs.
- `addTransactionMetadata` only appends the configured origin/timestamp trace data.
- `computeMaxRepaySharePrice` uses an upper slippage bound and caps at `MAX_ABSOLUTE_SHARE_PRICE`.
- Health, repay, share, deallocation, and reallocation helpers should expose protocol invariants clearly instead of hiding them behind generic utilities.

## `test`

- Security invariants are part of the SDK contract; test routing, authorization, `chainId`, builder/signer equality, LLTV buffers, and accounting behavior.
- Use the package test setup and fixtures; do not hardcode vault addresses in tests when fixtures exist.
- E2E action tests should cover transaction building, fork execution, invariant checks, and requirements flows for bundled actions.
- Never weaken assertions or replace strict assertions with loose ones to make a test pass.

## Continuous Improvement

- Existing code may predate these conventions; do not widen divergence when touching it.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If the SDK cannot yet meet an applicable convention, document the local exception here and make the touched surface closer to the target design.
