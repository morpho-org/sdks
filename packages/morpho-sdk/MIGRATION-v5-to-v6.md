# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 keeps the Blue entity at `client.morpho.blue(marketParams, chainId)` and preserves its
write-method names while routing them through five direct BlueBundlesV1 entrypoints. Blue reads and
versioned reallocation-data helpers remain on the same entity. There is no parallel BlueBundlesV1
extension or automatic fallback to the v5 route.

> **Chain availability.** The direct BlueBundlesV1 route requires the `bundles.blueBundlesV1`
> deployment on the target chain. On a registered chain without it (the previous Bundler3-routed
> flows covered more chains), **every** Blue write — `supply`, `supplyCollateral`, `borrow`,
> `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `withdraw`, and
> `refinance` — throws `UnknownAddressError` synchronously at handle creation (via
> `validateWriteCommon`). Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.blueBundlesV1 != null`.

Version 6 also preserves the Vault V1 and Vault V2 method and builder names while routing `deposit`,
`withdraw`, and `redeem` through VaultBundlesV1. Vault V1 `migrateToV2` uses the same fixed route.

> **Chain availability.** The VaultBundlesV1 route requires the `bundles.vaultBundlesV1` deployment
> on the target chain. On a registered chain without it (Celo, for example, still registers
> MetaMorpho and Vault V2 deployments), **every** routed vault write — Vault V1 `deposit`,
> `withdraw`, `redeem`, and `migrateToV2`, and Vault V2 `deposit`, `withdraw`, and `redeem` — throws
> `UnknownAddressError` synchronously at handle creation, where v5 built a direct vault or Bundler3
> call. Confirm coverage before upgrading, for example
> `getChainAddresses(chainId).bundles?.vaultBundlesV1 != null`. Vault `inKindRedeem` is unaffected:
> it already routed through `bundles.vaultExitBundlesV1` in v5, and its chain coverage is unchanged.

## Update Vault V1 and Vault V2 methods

| Stable method | v5 input/workflow | v6 input/workflow |
| --- | --- | --- |
| `deposit` | Additive `amount` and `nativeAmount`; Bundler3/GeneralAdapter1 requirements. | Supply exactly one of `amount` or `nativeAmount`; optionally set `deadline`, `referralFeePct`, and `referralFeeRecipient`. Token requirements authorize VaultBundlesV1 and may return Permit2 SignatureTransfer. |
| `withdraw` | Direct vault withdrawal with no share requirement. | Exact-assets VaultBundlesV1 exit. Optionally set `slippageTolerance`, `deadline`, and referral fields; resolve a vault-share approval or ERC-2612 permit before building. |
| `redeem` | Direct vault redemption with no share requirement. | Exact-shares VaultBundlesV1 exit. Optionally set `deadline` and referral fields; resolve a vault-share approval or ERC-2612 permit before building. |
| `migrateToV2` (Vault V1 only) | Share-denominated Bundler3 migration with a source `minSharePriceVaultV1`. | Keep the existing `shares` mode or supply the new `assets` alternative; remove the source share-price bound; optionally set `slippageTolerance`, `deadline`, and referral fields. Resolve source-vault share authorization before building. The destination deposit retains its onchain maximum-share-price bound. |

`userAddress` now means the account that will submit the transaction. VaultBundlesV1 always deposits
for, burns shares from, and pays `msg.sender`; arbitrary `recipient` and `onBehalf` values are no
longer supported. Keep `userAddress` equal to the eventual signer, including when preparing a
transaction with a public client.

The lazy workflow now applies to Vault V1 exits as well as deposits: await `getRequirements()`, send
any returned approval transactions or collect the returned signature, and pass collected signatures
to `buildTx(signatures)`. Deposit requirement options accept `useSimplePermit` and an explicit
`permit2Nonce`; exit requirements use the vault share token's ERC-2612 permit. The built transaction
targets VaultBundlesV1 rather than Bundler3 or the vault itself.

Pure builder names remain stable, but their `args` objects change:

| Stable builder | v6 `args` fields |
| --- | --- |
| `vaultV1Deposit` | Exclusive `amount`/`nativeAmount`, `maxSharePrice`, `userAddress`, optional bundles token `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1Withdraw` | `amount`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1Redeem` | `shares`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV1MigrateToV2` | Exclusive `assets`/`shares`, `targetVault`, `targetAsset`, `maxSharePriceVaultV2`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Deposit` | Exclusive `amount`/`nativeAmount`, `maxSharePrice`, `userAddress`, optional bundles token `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Withdraw` | `amount`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |
| `vaultV2Redeem` | `shares`, `userAddress`, optional vault-share `requirementSignature`, required `deadline`, and optional referral fields. |

Every vault builder replaces v5's `recipient` and `onBehalf` with a single `userAddress` that must be
the eventual `msg.sender`, and `vault` now takes `{ chainId, address }` (plus `asset` on the deposit
and migration builders) so the builder can resolve the VaultBundlesV1 address for the target chain.

Vault V1 deposit and migration destination bounds are forecast through the selected deadline, so an
explicit deadline beyond the two-hour default remains covered by the computed maximum share price.

## Update Blue methods

| Stable method | v5 input | v6 input |
| --- | --- | --- |
| `supply` | `amount`/`nativeAmount`, `marketData`, `slippageTolerance` | Rename gross `amount` to `assets`; remove `marketData` and slippage; add required `deadline` plus optional `referralFeePct` and `referralFeeRecipient`. ERC-20 and native funding are now exclusive. |
| `withdraw` | `assets` or `shares`, optional `receiver`, `slippageTolerance`, mixed-version `reallocations` | Keep `assets`/`shares`; remove `receiver` and slippage; use only `VaultV2BlueReallocation`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `supplyCollateral` | `amount` plus optional additive `nativeAmount` | Rename `amount` to `collateralAssets`; make native and ERC-20 funding exclusive; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `borrow` | `amount`, `slippageTolerance`, mixed-version `reallocations` | Rename `amount` to `borrowAssets`; remove slippage; use only `VaultV2BlueReallocation`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `supplyCollateralBorrow` | `amount`, `borrowAmount`, required `positionData`, `slippageTolerance`, mixed-version `reallocations` | Rename the legs to `collateralAssets` and `borrowAssets`; `positionData` is required only when borrowing; use exclusive native funding and V2-only reallocations; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `repay` | `amount` or `shares`, optional additive `nativeAmount`, `slippageTolerance` | Rename the modes to `repayAssets` or `repayShares`; use `maxUint256` shares for a full close; remove slippage; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. Native funding must cover the full derived cap. |
| `withdrawCollateral` | `amount` | Rename `amount` to `collateralAssets`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `repayWithdrawCollateral` | `amount` or `shares`, `withdrawAmount`, optional additive `nativeAmount`, `slippageTolerance` | Rename the repay modes to `repayAssets`/`repayShares` and `withdrawAmount` to `collateralAssets`; remove slippage; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. |
| `refinance` | `target`, `collateralAmount`, `borrowAssets`/`borrowShares`, `slippageTolerance`, `targetReallocations` | Rename `target` to `destination`; remove partial-leg amounts and share-price inputs; rename V2-only `targetReallocations` to `reallocations`; add `deadline`, `referralFeePct`, and `referralFeeRecipient`. The full live position always moves. |

The two combined methods require at least one non-zero leg. `refinance` supports only a
full debt-and-collateral migration between markets with the same loan and collateral tokens. Stay
on v5 if the product requires partial or collateral-only refinance behavior.

## Update pure action builder inputs and metadata

Direct action consumers keep the root-barrel builder and parameter-type names, but must replace
their `args` objects as follows. `metadata` is unchanged.

| Stable builder / params | v6 `args` fields |
| --- | --- |
| `blueSupply` / `BlueSupplyParams` | `userAddress`, `assets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueWithdraw` / `BlueWithdrawParams` | `userAddress`, `withdrawAssets`, `withdrawShares`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueSupplyCollateral` / `BlueSupplyCollateralParams` | `userAddress`, `collateralAssets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueBorrow` / `BlueBorrowParams` | `userAddress`, `borrowAssets`, `maxLtv`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueSupplyCollateralBorrow` / `BlueSupplyCollateralBorrowParams` | `userAddress`, `collateralAssets`, `borrowAssets`, `maxLtv`, optional `nativeAmount`/V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, `requirementSignature`, and `authorizationSignature`. |
| `blueRepay` / `BlueRepayParams` | `userAddress`, `repayAssets`, `repayShares`, `maxRepayAssets`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `requirementSignature`. |
| `blueWithdrawCollateral` / `BlueWithdrawCollateralParams` | `userAddress`, `collateralAssets`, `maxLtv`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`. |
| `blueRepayWithdrawCollateral` / `BlueRepayWithdrawCollateralParams` | `userAddress`, `repayAssets`, `repayShares`, `maxRepayAssets`, `collateralAssets`, `maxLtv`, optional `nativeAmount`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, `requirementSignature`, and `authorizationSignature`. |
| `blueRefinance` / `BlueRefinanceParams` | `userAddress`, `maxLtv`, optional V2 `reallocations`, required `deadline`, optional `referralFeePct`, `referralFeeRecipient`, and `authorizationSignature`; replace `source`/`target` with `market: { chainId, sourceMarketParams, destinationMarketParams }`. |

The transaction metadata exports and discriminator strings stay stable; their argument fields change:

| Stable action type / discriminator | Removed v5 `action.args` fields | v6 `action.args` fields |
| --- | --- | --- |
| `BlueSupplyAction` / `"blueSupply"` | `amount`, `maxSharePrice` | `assets`, `onBehalf`, optional `nativeAmount`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |
| `BlueWithdrawAction` / `"blueWithdraw"` | `assets`, `shares`, `receiver`, `minSharePrice`, `reallocationFee` | `withdrawAssets`, `withdrawShares`, `onBehalf`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |
| `BlueSupplyCollateralAction`, `BlueBorrowAction`, `BlueSupplyCollateralBorrowAction` | `amount`, `collateralAmount`, `borrowAmount`, `receiver`, `minSharePrice`, `reallocationFee` | All three use the combined shape: `collateralAssets`, `borrowAssets`, `maxLtv`, `onBehalf`, optional `nativeAmount`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`; an inactive simple-method leg is zero. |
| `BlueRepayAction`, `BlueWithdrawCollateralAction`, `BlueRepayWithdrawCollateralAction` | `amount`, `shares`, `transferAmount`, `withdrawAmount`, `receiver`, `maxSharePrice` | All three use the combined shape: `repayAssets`, `repayShares`, `maxRepayAssets`, `collateralAssets`, `maxLtv`, `onBehalf`, optional `nativeAmount`, `referralFeePct`, `referralFeeRecipient`, `deadline`; inactive simple-method legs are zero. |
| `BlueRefinanceAction` / `"blueRefinance"` | `targetMarket`, `collateralAmount`, `borrowAssets`, `borrowShares`, borrow/repay share-price bounds, `user`, `reallocationFee` | `sourceMarket`, `destinationMarket`, `maxLtv`, `onBehalf`, `reallocations`, `reallocationPenaltyAssets`, `referralFeePct`, `referralFeeRecipient`, `deadline`. |

`RepayAmountArgs` and `RepayActionAmountArgs` are removed. Use the mutually exclusive
`repayAssets` / `repayShares` fields on the replacement method or builder instead.

## Update write inputs

- Remove Blue `slippageTolerance`, `minSharePrice`, and `maxSharePrice` inputs. BlueBundlesV1 does
  not expose the Bundler3 share-price checks. Vault V2 deposit slippage protection is unchanged;
  Vault V1 deposits now enforce their computed maximum share price through VaultBundlesV1.
- Remove Blue `receiver`, `to`, and arbitrary `onBehalf` overrides. BlueBundlesV1 operates on the
  transaction sender and sends proceeds and refunds back to that sender; `userAddress` must be the
  eventual sender used to resolve requirements and position snapshots.
- Replace PublicAllocator V1 or mixed `BlueReallocationPlan` write inputs with Vault V2
  `VaultV2BlueReallocation` inputs. All Vault V1 reallocation planning, data, input, validation,
  and explicit low-level Bundler3-composition surfaces remain available only as deprecated
  compatibility surfaces and will be removed in the next major; the high-level Blue writes do not
  accept their outputs.
- Provide the BlueBundlesV1 execution deadline and any optional referral-fee configuration through
  the new typed method inputs. Share-mode repayment deadlines are limited to two hours so the SDK's
  derived `maxRepayAssets` remains sufficient through execution.
- Treat `supply` assets as gross funding: referral fees reduce assets supplied. Allocator penalties
  and referral fees similarly affect proceeds or destination debt on the other operations.
- For native funding, the funded token must be the chain's wNative. Native and ERC-20 funding are
  not additive on the direct BlueBundlesV1 call.

Borrow, collateral-withdraw, and migration legs retain the SDK's buffered LLTV validation. Pure
collateral supply and pure repay intentionally disable the onchain LTV cap so they can improve an
already-unhealthy position.

## Update requirements and transaction handling

The lazy workflow is unchanged: await `getRequirements()`, satisfy approval transactions, collect
signatures, then pass the signatures to synchronous `buildTx(signatures)`.

The destinations are different:

- Classic ERC-20 approvals and ERC-2612 permits now authorize BlueBundlesV1.
- Permit2 keeps its ERC-20 approval on canonical Permit2, but the SignatureTransfer payload names
  BlueBundlesV1 as spender.
- When selecting Permit2 SignatureTransfer, pass an explicit unused `permit2Nonce` to
  `getRequirements()`; the SDK checks its unordered nonce bitmap before returning the signature
  request.
- Morpho authorization now grants BlueBundlesV1 operator rights instead of GeneralAdapter1.
- Without signature support, saturated full-repay requirements use the token's reusable maximum
  allowance so a later bounded debt quote remains covered; BlueBundlesV1 still refunds unused
  transaction funding.
- The built transaction's `to` is BlueBundlesV1, not Bundler3, and calldata contains one fixed
  BlueBundlesV1 entrypoint rather than a `BundlerAction[]` multicall.

## Update Vault V1 and Vault V2 writes

Vault V1 and Vault V2 keep their existing `deposit`, `withdraw`, and `redeem` names, while Vault V1
keeps `migrateToV2`. In v6 these methods encode one direct `VaultBundlesV1` call instead of a direct
ERC-4626 call or Bundler3 multicall.

- Deposits accept exactly one of `amount` and `nativeAmount`. Split a former additive ETH + WETH
  deposit into two transactions. Classic approvals and ERC-2612 permits now authorize
  VaultBundlesV1; Permit2 uses SignatureTransfer and requires an explicit unused `permit2Nonce`.
- Remove `recipient` from deposits and remove `recipient` and `onBehalf` from exits. VaultBundlesV1
  always operates for and pays `msg.sender`. `userAddress` now means the account that must submit the
  transaction. A connected builder account may prepare a transaction for a different submitter;
  identity-bound signature helpers still enforce `userAddress` when signing.
- `withdraw` and `redeem` now return a full `ActionOutput`. Call `getRequirements()` and satisfy the
  exact vault-share approval or ERC-2612 permit before calling `buildTx(signatures)`; without
  signature support it returns one ERC-20 approval transaction to send first, and with
  `supportSignature: true` it returns one signable ERC-2612 shares permit that is folded into the
  VaultBundlesV1 call.
- Vault calls gain `deadline`, `referralFeePct`, and `referralFeeRecipient`. Entity deadlines default
  to two hours; pure builder callers provide them explicitly. Amounts remain gross, and fixed-asset
  action metadata drops `recipient` and reports the gross amount, optional `nativeAmount`,
  `maxSharePrice`, `referralFeePct`, `referralFeeRecipient`, exact `referralFeeAssets`, resulting
  `netAssets`, and `deadline`.
- `migrateToV2` accepts exactly one of `assets` and `shares`, removes `recipient` and source
  `minSharePriceVaultV1`, and retains only the destination `maxSharePriceVaultV2` bound.

On an asset-denominated exit the share allowance is the only cap on the burn, since the calldata
carries no maximum-shares argument. `getRequirements()` therefore derives an exact cap from the
vault snapshot, the deadline, and `slippageTolerance` (default 0.03%), and returns an approval or
permit for exactly that amount whenever the current allowance differs — including when a larger
leftover approval already exists. It also re-validates the deadline on every call, so a prepared
exit reused after its deadline throws `ExpiredDeadlineError` rather than returning cached
prerequisites.

VaultBundlesV1 permits only one call to itself in a transaction. Do not put two vault calls into one
Safe multisend or EIP-5792 batch; use `migrateToV2` for an atomic V1-to-V2 move. Permissioned Vault
V2 deployments must allow VaultBundlesV1 in both send-assets and receive-assets gates. Because gates
can inspect the bundle's transient initiator, validate them by simulating the finalized transaction
after satisfying requirements rather than by pre-reading the gate.

```ts
const withdrawal = vault.withdraw({ amount, userAddress });
const signatures = [];
for (const requirement of await withdrawal.getRequirements()) {
  if ("sign" in requirement) {
    signatures.push(await requirement.sign(walletClient, userAddress));
  } else {
    const hash = await walletClient.sendTransaction(requirement);
    await publicClient.waitForTransactionReceipt({ hash });
  }
}
const transaction = withdrawal.buildTx(signatures);
```

Update simulations and analytics for the v6 action-field changes. Do not assert
Bundler3/GeneralAdapter1 destinations or inspect Bundler3 sub-actions for these
high-level writes.

## Upgrade checklist

- Update every Vault V1 call for exclusive deposit funding, sender-bound outputs, deadlines,
  referral fields, and the new exit share-authorization workflow.
- Update Vault V1 migration's shares-only/source-bound input to the exclusive `assets`/`shares`
  union and destination-only share-price protection.
- Recreate Vault V1 token and share approvals for VaultBundlesV1, and update transaction decoding
  away from Bundler3/direct-vault destinations.
- Update every Blue write call using the table above; method names remain stable.
- Remove Blue slippage and PublicAllocator V1 write inputs.
- Re-run approval and Morpho-authorization setup against the new spender/operator.
- Update transaction decoding, simulation fixtures, and action metadata fields; discriminator
  names remain stable.
- Test native funding, full repay, and full-position migration paths used by the application.
