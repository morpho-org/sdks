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

- ERC-20 approval for **GeneralAdapter1** on the collateral token (any path that supplies collateral) or the loan token (`repay`, `repayWithdrawCollateral`). The approved amount is the **ERC-20 portion actually pulled**, not the total: for a native-funded repay it is `amount` (assets mode) or `max(0, toBorrowAssets(shares) − nativeAmount)` (shares mode — clamped at 0 so a `nativeAmount` that covers or exceeds the borrow assets pulls nothing). A fully-native repay pulls no ERC-20, so no approval requirement is emitted; in shares mode any wrapped native beyond the on-chain repay is skimmed back to the receiver.
- For loan-asset `supply`, the token prerequisite targets **BlueBundlesV1** directly — a classic approval, an ERC-2612 permit, or a Permit2 SignatureTransfer (Permit2 keeps its ERC-20 allowance on canonical Permit2, while the signed payload names BlueBundlesV1 as spender). A classic approval is for the **actual pull amount** unless a reusable `approvalAmount` is passed; an existing allowance that already covers the pull emits no approval. Native-funded supply pulls no ERC-20 and emits no token requirement.
- A classic ERC-20 approval for **GeneralAdapter1** on the loan token when `borrow` or `refinance` includes BluePublicAllocator reallocations with a non-zero penalty. `supplyCollateralBorrow` does the same when the collateral and loan tokens differ; when they are identical, it adds the penalty to the single collateral approval or permit and emits no separate penalty requirement. The approved amount is the sum of each call's independently rounded `ceil(assets × penalty / WAD)` donation. The separate-token path deliberately does not return a permit signature, so it can coexist with a collateral-token permit. Loan-asset `withdraw` emits no penalty approval: `blueBundlesV1Withdraw` nets each penalty from the withdrawn proceeds.
- `morpho.setAuthorization(operator, true)` when authorization is not yet set on Morpho — read via `publicActions`. The operator is **GeneralAdapter1** for `borrow`, `supplyCollateralBorrow`, and `repayWithdrawCollateral`, and **BlueBundlesV1** for loan-asset `withdraw`.

When `supportSignature` is enabled on the client, the authorization requirement is returned as a signable `Requirement` instead of a transaction; signing it produces an `AuthorizationRequirementSignature` that `buildTx` consumes so no standalone authorization transaction is needed. The bundler3 flows fold it into the bundle as a `setAuthorizationWithSig` call; loan-asset `withdraw` embeds it in the `blueBundlesV1Withdraw` signed-authorization struct instead. `buildTx` accepts a `readonly RequirementSignature[]` and splits permit vs. authorization signatures via `isPermitSignature` / `isAuthorizationSignature`.

`withdrawCollateral` has no requirements. `repay` and `supply` need only loan-token approval (native wrapping requires the loan token to be the chain's wNative). Without V2 reallocations, loan-asset `withdraw` needs only the Morpho authorization.
