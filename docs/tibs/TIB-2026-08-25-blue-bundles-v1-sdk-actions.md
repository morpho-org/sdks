# TIB-2026-08-25: Route Blue actions through BlueBundlesV1

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| **Status** | Proposed                                   |
| **Date**   | 2026-08-25                                 |
| **Author** | @Rubilmax / Carapulse draft                |
| **Scope**  | `morpho-sdk` 6.0.0, WDK 2.0.0, and `liquidity-sdk-viem` patch |

---

## Context

`client.morpho.blue(marketParams, chainId)` currently builds most write flows through Bundler3 and
GeneralAdapter1. `BlueBundlesV1` now provides fixed protocol-owned entrypoints for the same product
flows, with sequencing, permits, fees, refunds, and residue handling enforced by the contract.

Shipping `BlueBundlesV1` as a second extension would leave integrators choosing between two routes
for the same user intent. Version 6.0.0 instead makes it the single high-level write route for Blue.

## Decision

Keep `client.morpho.blue(marketParams, chainId)` as the public Blue entrypoint, but replace its write
surface with five methods that call the registered `BlueBundlesV1` deployment directly.

Do not add `client.morpho.blueBundlesV1(...)`, a route flag, or a Bundler3 fallback. Read methods
and reallocation data helpers remain on the Blue entity.

This migration invokes the narrow `BlueBundlesV1` route exception in [`AGENTS.md`](../../AGENTS.md)
§7. The listed replacements and downstream WDK input changes land with their removals, without a
prior deprecation minor, because publishing both routes would preserve the product ambiguity this
decision removes.

## Public interface

The Blue entity owns the source market, so methods do not repeat `marketParams`. Migration receives
only the destination market.

| Blue method | Replaces | `BlueBundlesV1` entrypoint |
| ----------- | -------- | -------------------------- |
| `supply` | `supply` | `supply` |
| `withdraw` | `withdraw` | `withdraw` |
| `supplyCollateralAndBorrow` | `supplyCollateral`, `borrow`, `supplyCollateralBorrow` | `supplyCollateralAndBorrow` |
| `repayAndWithdrawCollateral` | `repay`, `withdrawCollateral`, `repayWithdrawCollateral` | `repayAndWithdrawCollateral` |
| `migrateBorrowPosition` | `refinance` | `migrateBorrowPosition` |

The two combined methods accept either leg alone or both legs together. At least one leg must be
nonzero. `migrateBorrowPosition` uses the scoped market as source and always moves the full live
borrow position.

All five methods keep the existing lazy action shape:

- `getRequirements()` returns only token funding and Blue authorization required by that call;
- `buildTx(signatures)` stays synchronous and encode-only;
- the returned transaction targets `BlueBundlesV1`, never Bundler3 or GeneralAdapter1.

The pure action surface follows the same five operations. It encodes direct contract calls rather
than exposing a `BundlerAction[]` composition.

## Product behavior

- Direct ERC-20 approvals and ERC-2612 permits authorize `BlueBundlesV1` as spender. Permit2 keeps
  the ERC-20 allowance on canonical Permit2, while its signed transfer authorizes `BlueBundlesV1`.
  Blue authorization names `BlueBundlesV1` as the authorized account.
- Each call accepts the contract deadline and optional referral-fee configuration. Native funding
  remains available only when the funded token is the chain's wrapped native token.
- `supply` treats `assets` as gross funding; the referral fee reduces the amount supplied.
- `supplyCollateralAndBorrow` supports pure collateral supply, pure borrow, or both. Allocator
  penalties and referral fees reduce borrow proceeds.
- `repayAndWithdrawCollateral` supports assets or shares repayment, collateral withdrawal, or both.
  Full repay uses the contract's saturated shares value; `maxRepayAssets` covers debt plus fees and
  unused funding is refunded.
- `withdraw` supports assets or shares. Fees and allocator penalties reduce assets received; shares
  mode has no onchain minimum-assets guarantee.
- `migrateBorrowPosition` moves the full live debt and collateral between markets with identical
  loan and collateral tokens. Fees and allocator penalties increase destination debt. Partial and
  collateral-only migration are not supported.
- Vault V2 Blue reallocations map directly to the contract's `PublicAllocations`. Vault V1
  reallocations are no longer accepted by high-level Blue writes.
- Bundler3 share-price bounds and their `slippageTolerance` inputs are removed because
  `BlueBundlesV1` cannot enforce them.
- For the two combined entrypoints, pure collateral-supply and pure-repay calls pass
  `maxLtv = maxUint256`, allowing an already-unhealthy position to improve incrementally. The
  buffered LLTV limit applies when the borrow or collateral-withdraw leg is nonzero and on
  migration.

Existing SDK health, amount, chain, sender, deadline, and reallocation validation remains in the
entity layer where compatible with these contract semantics.

## Breaking changes and migration

This ships in `@morpho-org/morpho-sdk` 6.0.0.

- Replace `supplyCollateral`, `borrow`, and `supplyCollateralBorrow` calls with
  `supplyCollateralAndBorrow` and set the unused leg to zero.
- Replace `repay`, `withdrawCollateral`, and `repayWithdrawCollateral` calls with
  `repayAndWithdrawCollateral` and set the unused leg to zero.
- Replace `refinance` with `migrateBorrowPosition`; callers requesting partial migration must change
  product behavior or remain on the previous major.
- Update transaction discriminators, approval spenders, authorization targets, and simulations for
  direct `BlueBundlesV1` calls.
- Remove Bundler3-only share-price and Vault V1 reallocation inputs from Blue write calls.
- Migrate the four affected `@morpho-org/wdk-protocol-lending-morpho-evm` call sites (`borrow`,
  `repay`, `supplyCollateral`, and `withdrawCollateral`) to the combined replacements. Its 2.0.0
  release removes Vault V1 borrow reallocations and borrow/repay slippage inputs, retains Vault V2
  reallocations, scopes its constructor-level slippage tolerance to vault flows, and updates tests
  and migration docs.
- Widen `@morpho-org/liquidity-sdk-viem`'s `@morpho-org/morpho-sdk` peer range from `^5.4.0` to
  `^5.4.0 || ^6.0.0` after verifying its reallocation APIs against the new major.

The implementation PR audits every maintained direct runtime and peer dependent. Its changeset
bumps `@morpho-org/morpho-sdk` major, `@morpho-org/wdk-protocol-lending-morpho-evm` major, and
`@morpho-org/liquidity-sdk-viem` patch. The release includes migration guides. The previous majors
remain available for products that still require the Bundler3 route; the new majors do not carry
both routes.

## Non-goals

- Removing Bundler3 primitives used by other SDK products or advanced composition.
- Automatic routing between contracts.
- Generic callbacks or arbitrary bundle calls.
- Partial borrow-position migration.

## Verification

- Public API checks cover removed methods and the five replacement signatures.
- Unit tests cover direct calldata, requirement targets, fees, refunds, and zero-leg composition.
- Unit and fork tests prove pure collateral supply and pure repay use `maxUint256` and can improve an
  already-unhealthy position; borrow, collateral withdrawal, and migration retain the buffered
  limit.
- Pinned fork tests execute each entrypoint, including full repay and full-position migration.
- Existing Blue read and reallocation-planning APIs remain compatible.
- WDK tests cover all four migrated call sites, and liquidity-sdk type-checks with the widened peer
  range.

## References

- [BlueBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/dceb05da1c730424e6b36caf445dff808a2d5007/src/blue/BlueBundlesV1.sol)
- [BlueBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/dceb05da1c730424e6b36caf445dff808a2d5007/src/blue/interfaces/IBlueBundlesV1.sol)
