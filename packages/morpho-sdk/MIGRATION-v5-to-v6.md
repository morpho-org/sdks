# Migrating morpho-sdk v5 to v6

## Vault V1 and Vault V2 deposits

`MorphoVaultV1.deposit`, `MorphoVaultV2.deposit`, `vaultV1Deposit`, and `vaultV2Deposit` keep their
names but now route through the chain's registered VaultBundlesV1 contract instead of Bundler3 and
GeneralAdapter1.

Update deposit inputs as follows:

| v5 | v6 |
| --- | --- |
| `amount` plus optional additive `nativeAmount` | Choose exactly one positive `amount` or `nativeAmount`. |
| Low-level `args.recipient` | Remove it. VaultBundlesV1 mints shares to `msg.sender`; `userAddress` must be the signing and submitting account. |
| Optional Bundler3 `PermitRequirementSignature` | Use an ERC-2612 or Permit2 SignatureTransfer requirement returned by the prepared entity handle. |
| No deadline or referral fee | Entity methods accept an optional `deadline` that defaults to two hours from preparation; low-level builders require it. Both surfaces accept optional `referralFeePct` and `referralFeeRecipient`. |

For ERC-20 funding, approvals and ERC-2612 permits now name VaultBundlesV1 as spender. Permit2
keeps its ERC-20 approval on canonical Permit2, while its one-time SignatureTransfer payload names
VaultBundlesV1. Resolve requirements and build from the same prepared handle so its captured nonce,
deadline, asset, owner, amount, and spender remain consistent:

```ts
const deposit = vault.deposit({
  amount: 1_000_000n,
  userAddress,
  vaultData,
  referralFeePct,
  referralFeeRecipient,
});

const requirements = await deposit.getRequirements({ permit2Nonce });
// Submit approval transactions or sign the returned token requirement first.
const tx = deposit.buildTx(requirementSignature ? [requirementSignature] : undefined);
```

Deposit action metadata no longer contains `recipient`. It now reports the gross `amount`, optional
`nativeAmount`, `maxSharePrice`, `referralFeePct`, `referralFeeRecipient`, exact
`referralFeeAssets`, resulting `netAssets`, and `deadline`.

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
