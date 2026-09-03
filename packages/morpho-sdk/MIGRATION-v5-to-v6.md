# Migrating morpho-sdk v5 to v6

## Vault V2-only Blue write reallocations

High-level `borrow`, `withdraw`, `supplyCollateralBorrow`, and `refinance` inputs now accept only
`VaultV2BlueReallocation` entries. Replace Vault V1 write inputs with reallocations returned by
`getVaultV2BlueReallocations()`.

Vault V1 data fetchers, planners, types, and explicit low-level Bundler3 composition remain
available. Use them only when constructing Bundler3 calls directly.

## Blue supply and withdraw

The established `supply` and `withdraw` methods and pure builder names stay stable, but now encode
one direct BlueBundlesV1 call.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `supply` | `amount`, `marketData`, optional additive `nativeAmount`, `slippageTolerance` | Rename `amount` to `assets`; remove `marketData` and slippage; add required `deadline` and optional referral-fee fields. Native and ERC-20 funding are exclusive. |
| `withdraw` | `assets` or `shares`, optional `receiver`, `slippageTolerance`, `reallocations` | Keep the amount modes; remove `receiver` and slippage; add required `deadline` and optional referral-fee fields. |

`blueSupply` and `blueWithdraw` keep their names, but their `args` and action metadata use the new
BlueBundlesV1 fields. Supply approvals and permits target BlueBundlesV1. Withdraw authorization
also targets BlueBundlesV1, and proceeds always return to the transaction sender.

Permit2 uses SignatureTransfer for these direct token pulls: its ERC-20 prerequisite still targets
canonical Permit2, while the signed payload names BlueBundlesV1 as spender.

## Vault V1 and V2 withdrawals

The established `withdraw` methods and the `vaultV1Withdraw` / `vaultV2Withdraw` builder names stay
stable, but now encode one direct VaultBundlesV1 call instead of a direct vault call.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `withdraw` | `amount`, `userAddress` | Keep `amount` and `userAddress`; remove the implicit `recipient` / `onBehalf` (VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`); add optional `slippageTolerance`, `deadline`, and referral-fee fields. |

`withdraw` now returns `{ buildTx, getRequirements }` instead of `{ buildTx }`. VaultBundlesV1 spends
the caller's vault shares, so the withdrawal needs a vault-share allowance for VaultBundlesV1 — a
prerequisite v5 withdrawals did not have. Await `getRequirements()` and satisfy it before calling
`buildTx()`, or the withdrawal reverts:

- Without signature support, it returns one ERC-20 approval transaction to send first.
- With `supportSignature: true`, it returns one signable ERC-2612 shares permit; pass the signature
  to `buildTx([sharesPermit])` and it is folded into the VaultBundlesV1 call.

The allowance is the only cap on the burn, since asset-mode calldata carries no maximum-shares
argument. `getRequirements()` therefore derives an exact cap from the vault snapshot, the deadline,
and `slippageTolerance` (default 0.03%), and returns an approval or permit for exactly that amount
whenever the current allowance differs — including when a larger leftover approval already exists.

`getRequirements()` re-validates the deadline on every call, so a prepared withdrawal reused after
its deadline throws `ExpiredDeadlineError` rather than returning cached prerequisites.

## Blue collateral, borrow, repay, and collateral withdrawal

The six established methods below now map to the two BlueBundlesV1 combined entrypoints. Simple
methods set their inactive leg to zero.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `supplyCollateral` | `amount`, optional additive `nativeAmount` | Rename `amount` to `collateralAssets`; add `deadline` and optional referral-fee fields; native and ERC-20 funding are exclusive. |
| `borrow` | `amount`, `slippageTolerance`, `reallocations` | Rename `amount` to `borrowAssets`; remove slippage; add `deadline` and optional referral-fee fields. |
| `supplyCollateralBorrow` | `amount`, `borrowAmount`, required `positionData`, `slippageTolerance`, `reallocations` | Rename the legs to `collateralAssets` and `borrowAssets`; require `positionData` only for a non-zero borrow; remove slippage; add `deadline` and optional referral-fee fields. |
| `repay` | `amount` or `shares`, optional additive `nativeAmount`, `slippageTolerance` | Use `repayAssets` or `repayShares`; remove slippage; add `deadline` and optional referral-fee fields. Native funding covers the full derived cap. |
| `withdrawCollateral` | `amount` | Rename `amount` to `collateralAssets`; add `positionData`, `deadline`, and optional referral-fee fields. |
| `repayWithdrawCollateral` | repay `amount` or `shares`, `withdrawAmount`, optional additive `nativeAmount`, `slippageTolerance` | Use `repayAssets` or `repayShares`, rename `withdrawAmount` to `collateralAssets`, remove slippage, and add `deadline` plus optional referral-fee fields. |

`blueSupplyCollateral`, `blueBorrow`, and `blueSupplyCollateralBorrow` keep their names and share the
combined action shape: `collateralAssets`, `borrowAssets`, `maxLtv`, `onBehalf`, optional native
funding and V2 reallocations, referral-fee fields, and `deadline`.

`blueRepay`, `blueWithdrawCollateral`, and `blueRepayWithdrawCollateral` also keep their names and
share one combined action shape: `repayAssets`, `repayShares`, `maxRepayAssets`,
`collateralAssets`, `maxLtv`, `onBehalf`, optional native funding, referral-fee fields, and
`deadline`. Full repay uses saturated `repayShares`; share-mode deadlines are limited to the SDK's
two-hour funding quote horizon.

Token funding and Morpho authorization target BlueBundlesV1. Borrow and collateral-withdraw legs
retain the buffered LLTV guard. Pure collateral supply and pure repay disable the onchain LTV cap
so they can improve an unhealthy position.

`RepayAmountArgs` and `RepayActionAmountArgs` are removed; use the mutually exclusive
`repayAssets` / `repayShares` fields instead.

## Blue refinance

`refinance` and `blueRefinance` keep their names but now call BlueBundlesV1's full-position
migration entrypoint.

- Rename `target` to `destination`.
- Remove `collateralAmount`, `borrowAssets`, `borrowShares`, slippage, and share-price bounds.
- Rename V2-only `targetReallocations` to `reallocations`.
- Add `deadline` and optional referral-fee fields.
- Pass source and destination position snapshots; the markets must use the same loan and collateral
  tokens and must not be the same market.

The action metadata replaces `targetMarket`, partial-leg amounts, user, share-price bounds, and the
V1 fee with `destinationMarket`, `maxLtv`, `onBehalf`, a reallocation count and penalty total,
referral-fee fields, and `deadline`.

The full live source debt and collateral always move, and Morpho authorization targets
BlueBundlesV1. Stay on v5 if the product requires partial or collateral-only refinance behavior.
