# Migrating to 2.0

Version 2 routes Morpho Blue writes through `BlueBundlesV1` and migrates vault deposits through `VaultBundlesV1`.

## Vault supply migration

Version 2 removes the Bundler3/GeneralAdapter1 vault deposit route and
`getSupplyRequirements`. The standard WDK `supply` and `quoteSupply` methods now use
VaultBundlesV1 with `MorphoExclusiveSupplyOptions` and existing token approvals or native
funding. Signed deposits use `prepareSupply`. The exported `MorphoSupplyOptions`,
`MorphoErc20SupplyOptions`, `MorphoNativeSupplyOptions`, and
`ApprovalOrSignatureRequirement` compatibility types are removed.

Use `MorphoExclusiveSupplyOptions` with `prepareSupply`, then call the same handle's
`getRequirements`, `submit`, and `quote`. Every vault deposit uses VaultBundlesV1,
exclusive ERC-20 or native funding, and ERC-2612 or Permit2 SignatureTransfer permits.
Existing GeneralAdapter1 approvals and Permit2 AllowanceTransfer signatures cannot fund
these deposits. There is no Bundler3 fallback.

## Required changes

- Replace Vault V1 borrow reallocations with `VaultV2BlueReallocation` values on `MorphoBorrowOptions.reallocations`.
- Replace `MorphoBorrowWithVaultV2ReallocationsOptions` with `MorphoBorrowOptions`. The specialized opt-in type and the package's Vault V1 reallocation re-exports were removed.
- Remove `slippageTolerance` from `MorphoBorrowOptions`, `MorphoRepayOptions`, and Blue collateral-supply inputs. Constructor-level and vault-supply slippage settings now apply only to Morpho Vault V2 flows because BlueBundlesV1 has no Bundler3 share-price bounds.
- Call `getWithdrawCollateralRequirements` before `withdrawCollateral`. Send the returned authorization transaction, or sign the requirement and pass its result as `requirementSignature`.
- Use `MorphoCollateralSupplyOptions` for Blue collateral methods and `MorphoExclusiveSupplyOptions` for prepared vault deposits. Both successor types accept either `amount` or `nativeAmount`, never both. Mixing the funding keys throws `MixedBundlesFundingError` (exported by `@morpho-org/morpho-sdk`) for `prepareSupply` and `MixedBlueCollateralFundingError` (exported by this package) for Blue collateral.
- Migrate from `getSupplyRequirements(options)` to `prepareSupply(options)`. The returned handle carries `getRequirements(requirementOptions?)`, `submit(requirementSignature?, config?)`, and `quote(requirementSignature?, config?)` over one SDK action. Pass the signed permit to that same handle's `submit` or `quote`. Option-level vault `requirementSignature` is no longer accepted.
- When adopting `prepareSupply`, approve `VaultBundlesV1` instead of GeneralAdapter1. Existing GeneralAdapter1 allowances no longer fund vault deposits.
- Prepared vault deposits expire after two hours and enforce the signed permit's deadline; `slippageTolerance` still bounds `maxSharePrice`.
- Prepared supply methods recheck the live provider chain on every call. Handle `ChainIdMismatchError`, re-exported by this package, if the wallet switches away from the configured vault chain.
- Pass an explicit unused `permit2Nonce` to token `get*Requirements` calls, and to the prepared deposit's `getRequirements`, when selecting Permit2 SignatureTransfer.
- Recreate cached approvals and Morpho authorizations for Blue writes. Their spender and authorization target is now BlueBundlesV1 instead of GeneralAdapter1.
- Blue writes now expire after two hours instead of using an unbounded deadline; signed calls preserve the requirement signature's deadline.
- With signatures disabled, `getRepayRequirements({ amount: "max" })` may return the token's
  reusable maximum approval; the later BlueBundlesV1 transaction still uses a bounded funding cap
  and refunds excess.

## TypeScript output changes

- `get*Requirements()` returns a readonly array. Treat it as an immutable result instead of
  pushing requirements into it.
- `RequirementApproval` and `RequirementAuthorization` are readonly transactions.
- `RequirementSignatureRequest<TSignature>` is now generic. Prepared vault and Blue token requirements use
  `BundlesTokenRequirementSignature` (renamed from `BlueBundlesV1TokenRequirementSignature`),
  and Blue authorization requirements use
  `AuthorizationRequirementSignature`.
- Use `BundlesApprovalOrSignatureRequirement` for prepared vault deposits and Blue token-funded writes, and
  `AuthorizationOrSignatureRequirement` for Blue borrow or withdrawal authorization.
  `BlueApprovalOrSignatureRequirement` remains a deprecated alias of the first.
- `requirementSignature` is correspondingly narrowed on `MorphoCollateralSupplyOptions`,
  `MorphoBorrowOptions`, `MorphoRepayOptions`, and the new `MorphoWithdrawCollateralOptions`.
  Prepared vault deposits take it as the first argument of `PreparedMorphoSupply.submit` / `.quote`.

## Borrow reallocations

Before:

```ts
import type {
  MorphoBorrowWithVaultV2ReallocationsOptions,
  VaultReallocation,
} from "@morpho-org/wdk-protocol-lending-morpho-evm";
```

After:

```ts
import type {
  MorphoBorrowOptions,
  VaultV2BlueReallocation,
} from "@morpho-org/wdk-protocol-lending-morpho-evm";

const options = {
  token: loanToken,
  amount: 1_000_000n,
  reallocations,
} satisfies MorphoBorrowOptions;
```

## Collateral withdrawal authorization

```ts
const options = {
  token: collateralToken,
  amount: 1_000_000n,
};
const requirements = await morpho.getWithdrawCollateralRequirements(options);

const requirement = requirements[0];
if (requirement && "sign" in requirement) {
  const requirementSignature = await requirement.sign(walletClient, userAddress);
  await morpho.withdrawCollateral({ ...options, requirementSignature });
} else {
  for (const transaction of requirements) {
    if ("to" in transaction) {
      const result = await account.sendTransaction({
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
      });
      await publicClient.waitForTransactionReceipt({ hash: result.hash });
    }
  }
  await morpho.withdrawCollateral(options);
}
```

## Vault deposits

Before (Bundler3 requirements and option-level signatures removed in 2.0):

```ts
const options = { token: vaultAsset, amount: 1_000_000n };
const requirements = await morpho.getSupplyRequirements(options);

let requirementSignature;
for (const requirement of requirements) {
  if ("sign" in requirement) {
    requirementSignature = await requirement.sign(walletClient, userAddress);
  } else {
    const result = await account.sendTransaction({
      to: requirement.to,
      value: requirement.value,
      data: requirement.data,
    });
    await publicClient.waitForTransactionReceipt({ hash: result.hash });
  }
}
await morpho.supply({ ...options, requirementSignature });
```

After:

```ts
const prepared = await morpho.prepareSupply({ token: vaultAsset, amount: 1_000_000n });
const requirements = await prepared.getRequirements();

let requirementSignature;
for (const requirement of requirements) {
  if ("sign" in requirement) {
    requirementSignature = await requirement.sign(walletClient, userAddress);
  } else {
    const result = await account.sendTransaction({
      to: requirement.to,
      value: requirement.value,
      data: requirement.data,
    });
    await publicClient.waitForTransactionReceipt({ hash: result.hash });
  }
}

await prepared.submit(requirementSignature);
```

`prepareSupply` resolves the vault and its share price once, and each handle only accepts the
signature produced by its own `getRequirements`. Reuse one handle across resolution and
submission: passing a signature from a different handle throws `BundlesPermitMismatchError`.

`repay({ amount: "max" })` now uses BlueBundlesV1's saturated full-repay mode, so it closes the live remaining debt even if the borrow-share balance decreases before execution.
