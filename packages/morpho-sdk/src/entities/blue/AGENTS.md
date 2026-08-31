# `entities/blue/`

`MorphoBlue` implements `BlueActions`. Constructor:
`MorphoBlue(client, marketParams: MarketParams, chainId)`. Inherits
[`entities/AGENTS.md`](../AGENTS.md).

## State reads

- `getMarketData` / `getPositionData` fetch state via `fetchMarket` /
  `fetchAccrualPosition`.
- `AccrualPosition` exposes `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`,
  `supplyShares`, and derived `supplyAssets`.
- Versioned Vault V1 and Vault V2 reallocation-data fetchers remain readable planning APIs. Only
  Vault V2 reallocation outputs are accepted by high-level Blue writes.

## Write surface and routing

`client.morpho.blue(marketParams, chainId)` preserves the established high-level write surface:

- `supply`
- `withdraw`
- `supplyCollateral`
- `borrow`
- `supplyCollateralBorrow`
- `repay`
- `withdrawCollateral`
- `repayWithdrawCollateral`
- `refinance`

Each lazy action delegates to a pure encoder for one direct BlueBundlesV1 call. The entity does not
offer Bundler3 fallback, a route flag, or a parallel BlueBundlesV1 factory. Blue write inputs do not
include `slippageTolerance`, `minSharePrice`, or `maxSharePrice`.

## LLTV buffer (safety guard, asserted in tests)

Borrow, collateral-withdraw, and migration legs enforce a buffer below LLTV:

- `maxSafeBorrow = collateralValue × (LLTV − DEFAULT_LLTV_BUFFER)`, where `collateralValue` uses
  `ORACLE_PRICE_SCALE = 1e36`.
- `DEFAULT_LLTV_BUFFER` is hardcoded at 0.5% (`WAD / 200`) and is not user-configurable.
- `borrow` and `supplyCollateralBorrow` enforce the cap when `borrowAssets > 0n`.
- `withdrawCollateral` and `repayWithdrawCollateral` enforce it when `collateralAssets > 0n`.
- `refinance` enforces it on the destination position.
- Pure collateral supply and pure repay pass `maxUint256` to BlueBundlesV1, allowing an unhealthy
  position to improve incrementally.

The entity throws the existing typed health and market-price errors before encoding when the
required snapshot cannot prove the buffered position safe.

## Requirements

`getRequirements()` returns only prerequisites used by the selected legs:

- `supply` funds the loan token.
- `supplyCollateral`, `borrow`, and `supplyCollateralBorrow` fund the collateral token when
  `collateralAssets > 0n` and request Morpho authorization when `borrowAssets > 0n`.
- `repay`, `withdrawCollateral`, and `repayWithdrawCollateral` fund the bounded loan-token amount
  derived from the selected repay mode, `positionData`, and deadline, and request Morpho
  authorization when
  `collateralAssets > 0n`. Share-mode deadlines cannot exceed the two-hour funding quote horizon.
  A saturated full repay without signature support requests the token's reusable maximum allowance,
  while the encoded call remains bounded by the derived `maxRepayAssets` and refunds unused funding.
- `withdraw` and `refinance` request Morpho authorization.

Classic approvals and ERC-2612 permits name BlueBundlesV1 as spender. Permit2 SignatureTransfer has
two parts: the ERC-20 prerequisite names canonical Permit2, while the signed transfer names
BlueBundlesV1. Native-only funding emits no token requirement and requires the funded token to be
the chain's wNative.

Morpho authorization also names BlueBundlesV1, not GeneralAdapter1. When `supportSignature` is
enabled, the entity returns a signable authorization `Requirement`; otherwise it returns the
standalone `morpho.setAuthorization(blueBundlesV1, true)` transaction. No requirement is returned
when the corresponding allowance or authorization is already sufficient.

`buildTx` accepts the collected `readonly RequirementSignature[]`, rejects duplicate or unused
signature kinds, and reshapes accepted signatures into the direct contract's token-permit and
signed-authorization structs. It stays synchronous and performs no reads.

## Reallocations

`borrow`, `supplyCollateralBorrow`, `withdraw`, and `refinance` accept only
`VaultV2BlueReallocation` inputs. The entity validates and normalizes them before the lazy output is
returned. BlueBundlesV1 executes their `PublicAllocations` unconditionally; allocator penalties are
accounted for in contract proceeds or destination debt, so they do not create a separate
GeneralAdapter1 approval requirement.
