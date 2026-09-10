# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 keeps the Blue entity at `client.morpho.blue(marketParams, chainId)` and preserves its
write-method names while routing them through five direct BlueBundlesV1 entrypoints. Blue reads and
versioned reallocation-data helpers remain on the same entity. There is no parallel BlueBundlesV1
extension or automatic fallback to the v5 route.

## Vault V1 and Vault V2 deposits

`MorphoVaultV1.deposit`, `MorphoVaultV2.deposit`, `vaultV1Deposit`, and `vaultV2Deposit` keep their
names but now route through the chain's registered VaultBundlesV1 contract instead of Bundler3 and
GeneralAdapter1.

> **Chain availability.** Vault deposits and withdrawals require the `bundles.vaultBundlesV1`
> deployment on the target chain. On a registered chain without it, including Fraxtal,
> `MorphoVaultV1.deposit()`, `MorphoVaultV2.deposit()`, `MorphoVaultV1.withdraw()`, and
> `MorphoVaultV2.withdraw()` throw `UnknownAddressError` synchronously at handle creation,
> before `getRequirements()` or `buildTx()` can be called. This is a breaking loss of deposit
> and withdrawal functionality on chains previously supported through Bundler3/GeneralAdapter1
> deposits and direct vault withdrawals; there is no automatic fallback. Confirm coverage before
> upgrading with `getChainAddresses(chainId).bundles?.vaultBundlesV1 != null`. Stay on v5 if your
> application needs deposits or withdrawals on an affected chain until VaultBundlesV1 is deployed
> and registered in the SDK.

As checked on 2026-09-07, the [official deployment list](https://docs.morpho.org/developers/contracts/addresses/#bundles)
and the [SDK registry](../morpho-ts/src/addresses.ts) list VaultBundlesV1 on 13 chains: Ethereum,
Arbitrum, Base, HyperEVM, Katana, Monad, Optimism, Polygon, Robinhood, Stable, Tempo, Unichain, and
World Chain. Bundler3 availability alone does not imply support for v6 vault deposits or withdrawals.

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

## Blue write routing

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

The two combined methods require at least one non-zero leg. See the dedicated **Blue refinance**
section below for that method's larger shape change.

## Update pure action builder inputs and metadata

## Vault V1 and V2 withdrawals

The established `withdraw` methods and the `vaultV1Withdraw` / `vaultV2Withdraw` builder names stay
stable, but now encode one direct VaultBundlesV1 call instead of a direct vault call.

> **Chain availability.** Both entity `withdraw()` methods require `bundles.vaultBundlesV1` and
> throw `UnknownAddressError` synchronously at handle creation on registered chains without it,
> including Fraxtal. Stay on v5 if your application needs withdrawals on an affected chain until
> VaultBundlesV1 is deployed and registered in the SDK, even if your application makes no deposits.

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

## Blue pure action builder inputs and metadata
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

The transaction metadata exports and discriminator strings stay stable; their argument fields change
as below. The table lists only the delta: unchanged fields are retained and omitted. In particular
every Blue action keeps its `market` (`Hex` market id) field, so a strict decoder must keep matching
it alongside the added fields.

| Stable action type / discriminator | Removed v5 `action.args` fields | Changed / added v6 `action.args` fields |
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
  not expose the Bundler3 share-price checks. Vault deposit slippage protection is unchanged.
- Remove Blue `receiver`, `to`, and arbitrary `onBehalf` overrides. BlueBundlesV1 operates on the
  transaction sender and sends proceeds and refunds back to that sender; `userAddress` must be the
  eventual sender used to resolve requirements and position snapshots.
- Replace PublicAllocator V1 or mixed-version reallocation write inputs with Vault V2
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
  BlueBundlesV1 as spender. Explicit Permit2 nonces are now required — see the subsection below.
- Morpho authorization now grants BlueBundlesV1 operator rights instead of GeneralAdapter1.
- Without signature support, saturated full-repay requirements use the token's reusable maximum
  allowance so a later bounded debt quote remains covered; BlueBundlesV1 still refunds unused
  transaction funding.
- The built transaction's `to` is BlueBundlesV1, not Bundler3, and calldata contains one fixed
  BlueBundlesV1 entrypoint rather than a `BundlerAction[]` multicall.

Update simulations and analytics for the v6 action-field changes. Do not assert
Bundler3/GeneralAdapter1 destinations or inspect Bundler3 sub-actions for these
high-level writes.

### Permit2 SignatureTransfer requires an explicit nonce

SignatureTransfer consumes an owner-global unordered nonce rather than an allowance, so the SDK no
longer allocates one implicitly. For a client with `supportSignature: true`, the default supply
requirement path selects Permit2 and `supply(...).getRequirements()` now throws
`MissingPermit2SignatureTransferNonceError` when no nonce is supplied. Pass an unused nonce explicitly:

```ts
const requirements = await market
  .supply({ userAddress, assets, deadline })
  .getRequirements({ permit2Nonce });
```

Allocate any `uint256` whose Permit2 `nonceBitmap` bit is still unset for `userAddress` (each nonce
is single-use; a consumed one throws `Permit2SignatureTransferNonceAlreadyUsedError`). To skip Permit2
for ERC-2612 tokens, pass `getRequirements({ useSimplePermit: true })`, which prefers a one-signature
ERC-2612 permit and needs no nonce.

## Blue refinance

The `refinance` entity method and the `blueRefinance` pure builder keep their names but now call
BlueBundlesV1's full-position migration entrypoint. Both drop partial and collateral-only migration:
the full live source debt and collateral always move, the source and destination markets must use the
same loan and collateral tokens and must not be the same market, and Morpho authorization targets
BlueBundlesV1.

`userAddress` must be the account that sends the transaction and, when used, signs the Morpho
authorization. BlueBundlesV1 migration calldata carries no owner field and always migrates
`msg.sender`; a supplied authorization signature is likewise bound to that sender. Unlike the v5
Bundler3 route (where `args.user` was encoded as `onBehalf` in every leg), a relayer can no longer
migrate a third party's position. Builders cannot enforce that `userAddress` matches the sender; a
mismatch does not itself revert, and BlueBundlesV1 still migrates `msg.sender`. The SDK uses
`userAddress` only to validate snapshots, build the authorization requirement, and populate action
metadata.

`market.refinance(...)` (entity method):

- Rename `target` to `destination`.
- Remove `collateralAmount`, `borrowAssets`, `borrowShares`, slippage, and share-price bounds.
- Rename V2-only `targetReallocations` to `reallocations`.
- Add `deadline` and optional referral-fee fields.
- Pass source and destination position snapshots.

`blueRefinance(...)` (pure builder):

- Replace the top-level `{ source: { chainId, marketParams }, target: { marketParams } }` shape with
  `{ market: { chainId, sourceMarketParams, destinationMarketParams } }`.
- Rename `args.user` to `args.userAddress` and supply `args.maxLtv` (the buffered destination LTV).
- Remove `args.collateralAmount`, `args.borrowAssets`, `args.borrowShares`,
  `args.minBorrowSharePrice`, and `args.maxRepaySharePrice`.
- Rename `args.targetReallocations` to `args.reallocations`.
- Add `args.deadline` and optional referral-fee fields.

The action metadata replaces `targetMarket`, partial-leg amounts, user, share-price bounds, and the
V1 fee with `destinationMarket`, `maxLtv`, `onBehalf`, a reallocation count and penalty total,
referral-fee fields, and `deadline`.

Stay on v5 if the product requires partial or collateral-only refinance behavior.

The partial-migration error classes `BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, and `RefinanceSharesMissingBorrowAssetsError` are **deprecated,
not removed**: they stay exported through v6 (marked `@deprecated`) for consumers pattern-matching on
the v5 surface, are never thrown by the full-position route, and are removed in the next major. The
full-position route validates snapshot ownership and token/market compatibility, accounts for
reallocation penalties in destination debt, then checks the combined destination position against
the buffered LLTV (`BorrowExceedsSafeLtvError`); `RefinanceSameMarketError` and
`RefinanceTokenMismatchError` stay.

## Removed action-output field: `reallocationFee`

`BlueBorrowAction`, `BlueWithdrawAction`, `BlueSupplyCollateralBorrowAction`, and
`BlueRefinanceAction` no longer expose `reallocationFee` in `action.args`. That field only ever
carried Vault V1 native PublicAllocator fees, which high-level writes no longer emit. Read
`reallocationPenaltyAssets` for the loan-token penalty donated by Vault V2 BluePublicAllocator
reallocations.

## Removed type: `BlueReallocationPlan`

The `BlueReallocationPlan` union is removed. High-level Blue write inputs accept
`Iterable<VaultV2BlueReallocation>` directly; for explicit low-level Vault V1 composition, use
`VaultV1Reallocation[]`.

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
  exact vault-share approval or ERC-2612 permit before calling `buildTx(signatures)`.
- Vault calls gain `deadline`, `referralFeePct`, and `referralFeeRecipient`. Entity deadlines default
  to two hours; pure builder callers provide them explicitly. Amounts remain gross, and fixed-asset
  action metadata reports `referralFeeAssets` and `netAssets`.
- `migrateToV2` accepts exactly one of `assets` and `shares`, removes `recipient` and source
  `minSharePriceVaultV1`, and retains only the destination `maxSharePriceVaultV2` bound.

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

## Upgrade checklist

- Confirm `bundles.vaultBundlesV1` coverage for vault deposits and withdrawals and
  `bundles.blueBundlesV1` coverage for Blue writes on every chain your application supports.
  Stay on v5 if you need vault deposits or withdrawals on a chain without VaultBundlesV1.
- Update every Blue write call using the table above; method names remain stable.
- Remove Blue slippage and PublicAllocator V1 write inputs.
- Re-run approval and Morpho-authorization setup against the new spender/operator.
- Update transaction decoding, simulation fixtures, and action metadata fields; discriminator
  names remain stable.
- Test native funding, full repay, and full-position migration paths used by the application.

## Fixed-bundles token requirement APIs

The Blue-only fixed-bundles requirement surface is generalized into a shared surface used by both
BlueBundlesV1 and VaultBundlesV1.

| v5 symbol | v6 replacement |
| --- | --- |
| `getBlueBundlesV1TokenRequirements` (action-layer) | `getBundlesTokenRequirements` (entity-layer; reads state, so it now lives under `entities/requirements` instead of `actions/requirements/blue`). Takes the same funding parameters plus a `spender` naming the registered fixed bundles deployment (BlueBundlesV1 or VaultBundlesV1). |
| `BlueBundlesV1TokenSignatureRequirement` / `BlueBundlesV1TokenRequirementSignature` | `BundlesTokenSignatureRequirement` / `BundlesTokenRequirementSignature` |
| `encodeErc20Permit2TransferFrom` | `encodeErc20Permit2SignatureTransfer` |
| Action discriminator `"permit2TransferFrom"` | `"permit2SignatureTransfer"` |
| `Permit2TransferFromAction` / `Permit2TransferFromRequirementSignature` | `Permit2SignatureTransferAction` / `Permit2SignatureTransferRequirementSignature` |
| `isPermit2TransferFromSignature` | `isPermit2SignatureTransferSignature` |
| `selectRequirementSignatures` option and result field `permit2TransferFrom` | `permit2SignatureTransfer` |
| `MissingPermit2TransferFromNonceError` | `MissingPermit2SignatureTransferNonceError` (old name kept as a `@deprecated` alias) |
| `Permit2TransferFromNonceAlreadyUsedError` | `Permit2SignatureTransferNonceAlreadyUsedError` (old name kept as a `@deprecated` alias) |

Update call sites and `switch`/discriminated-union checks on `action.type` to the new
`"permit2SignatureTransfer"` tag; the signed payload shape (`nonce`, `deadline`, `signature`) is
unchanged.
