# `entities/blue/`

`MorphoBlue` implements `BlueActions`. Constructor: `MorphoBlue(client, marketParams: MarketParams, chainId)`. Inherits [`entities/AGENTS.md`](../AGENTS.md).

## State reads

- `getMarketData` / `getPositionData` fetch state via `fetchMarket` / `fetchAccrualPosition`.
- `AccrualPosition` exposes `maxBorrowAssets`, `ltv`, `isHealthy`, `borrowAssets`, `collateral`, `supplyShares`, and a derived `supplyAssets` (via `market.toSupplyAssets(supplyShares)`).

## LLTV buffer (safety guard, asserted in tests)

`supplyCollateralBorrow` and the post-withdraw safety checks on `withdrawCollateral` and `repayWithdrawCollateral` enforce a buffer below LLTV:

- `maxSafeBorrow = collateralValue × (LLTV − DEFAULT_LLTV_BUFFER)` where `collateralValue` uses `ORACLE_PRICE_SCALE = 1e36`.
- `DEFAULT_LLTV_BUFFER` is hardcoded at 0.5% (`WAD/200`); not user-configurable.
- Throws `BorrowExceedsSafeLtvError` (carrying `borrowAmount`, `maxSafeBorrow`) when the post-borrow position would exceed the buffer.
- Throws `MissingMarketPriceError` when the oracle price is unavailable.

## Authorization requirements

`getRequirements` returns:

- ERC-20 approval for **BlueBundlesV1** on the collateral token (any path that supplies collateral: `supplyCollateral`, `supplyCollateralBorrow`) or the loan token (`repay`, `repayWithdrawCollateral`, loan-asset `supply`). Native funding is all-or-nothing (see the routing summary), so the approval is emitted only for a non-native path and covers the full funded amount actually pulled: `collateralAssets` for collateral supply, `assets` for loan-asset `supply`, and the derived `maxRepayAssets` cap (repay assets/shares plus referral fee) for `repay` / `repayWithdrawCollateral`. A fully-native supply/repay pulls no ERC-20, so no approval requirement is emitted. The prerequisite is a classic approval, an ERC-2612 permit, or a Permit2 SignatureTransfer (Permit2 keeps its ERC-20 allowance on canonical Permit2, while the signed payload names BlueBundlesV1 as spender). A classic approval is for the **actual pull amount** unless a reusable `approvalAmount` is passed; an existing allowance that already covers the pull emits no approval.
- No separate penalty approval for `borrow` / `supplyCollateralBorrow`: their BluePublicAllocator reallocations ride inside the `blueBundlesV1SupplyCollateralAndBorrow` calldata and the contract nets each `ceil(assets × penalty / WAD)` penalty from the borrow proceeds (the builder rejects an aggregate penalty above `borrowAssets`). Loan-asset `withdraw` and `refinance` likewise emit no penalty approval: their Vault V2 reallocations ride inside the BlueBundlesV1 calldata, and each penalty is netted from the withdrawn proceeds (`withdraw`) or added to the migrated destination debt (`refinance`).
- `morpho.setAuthorization(operator, true)` when authorization is not yet set on Morpho — read via `publicActions`. The operator is **BlueBundlesV1** for `borrow`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `withdrawCollateral`, loan-asset `withdraw`, and `refinance`.

When `supportSignature` is enabled on the client, the authorization requirement is returned as a signable `Requirement` instead of a transaction; signing it produces an `AuthorizationRequirementSignature` that `buildTx` consumes so no standalone authorization transaction is needed. The BlueBundlesV1 combined calls, loan-asset `withdraw`, and `refinance` embed the signed-authorization struct directly in their calldata. `buildTx` accepts a `readonly RequirementSignature[]` and splits permit vs. authorization signatures via `isPermitSignature` / `isAuthorizationSignature`.

`supplyCollateral` needs only the BlueBundlesV1 collateral approval; `repay` and `supply` need only the BlueBundlesV1 loan-token approval (native funding requires the loan token to be the chain's wNative). `withdrawCollateral` needs only the BlueBundlesV1 Morpho authorization. Without V2 reallocations, loan-asset `withdraw` needs only the Morpho authorization.
