# Migrating to 2.0

Version 2 routes Morpho Blue writes through `BlueBundlesV1` and introduces prepared vault deposits and withdrawals through `VaultBundlesV1`.

## Vault supply deprecation through 2.x

The existing `supply`, `getSupplyRequirements`, and `quoteSupply` methods remain functional
throughout WDK 2.x and are marked `@deprecated`. The exported `MorphoSupplyOptions`,
`MorphoErc20SupplyOptions`, and `MorphoNativeSupplyOptions` types also remain available.
These compatibility APIs keep their Bundler3/GeneralAdapter1 route, additive ERC-20/native funding,
existing GeneralAdapter1 approvals, and option-level ERC-2612 or Permit2 AllowanceTransfer signatures.
They are scheduled for removal in **3.0**, after the 2.x deprecation period.

New integrations should use `MorphoExclusiveSupplyOptions` with `prepareSupply`, then call the
same handle's `getRequirements`, `submit`, and `quote`. This successor uses VaultBundlesV1,
exclusive funding, and Permit2 SignatureTransfer. Its approvals and signatures are specific to
that route; legacy GeneralAdapter1 approvals and permits cannot fund a prepared deposit.

## Required changes

- Replace Vault V1 borrow reallocations with `VaultV2BlueReallocation` values on `MorphoBorrowOptions.reallocations`.
- Replace `MorphoBorrowWithVaultV2ReallocationsOptions` with `MorphoBorrowOptions`. The specialized opt-in type and the package's Vault V1 reallocation re-exports were removed.
- Remove `slippageTolerance` from `MorphoBorrowOptions`, `MorphoRepayOptions`, and Blue collateral-supply inputs. Constructor-level and vault-supply slippage settings now apply only to Morpho Vault V2 flows because BlueBundlesV1 has no Bundler3 share-price bounds.
- Call `getWithdrawCollateralRequirements` before `withdrawCollateral`. Send the returned authorization transaction, or sign the requirement and pass its result as `requirementSignature`.
- Use `MorphoCollateralSupplyOptions` for Blue collateral methods and `MorphoExclusiveSupplyOptions` for prepared vault deposits. Both successor types accept either `amount` or `nativeAmount`, never both. Mixing the funding keys throws `MixedBundlesFundingError` (exported by `@morpho-org/morpho-sdk`) for `prepareSupply` and `MixedBlueCollateralFundingError` (exported by this package) for Blue collateral. Deprecated vault supply methods still accept additive funding.
- Migrate from `getSupplyRequirements(options)` to `prepareSupply(options)`. The returned handle carries `getRequirements(requirementOptions?)`, `submit(requirementSignature?, config?)`, and `quote(requirementSignature?, config?)` over one SDK action. Pass the signed permit to that same handle's `submit` or `quote`; option-level `requirementSignature` remains supported only by deprecated `supply` and `quoteSupply`.
- When adopting `prepareSupply`, approve `VaultBundlesV1` instead of GeneralAdapter1. Existing GeneralAdapter1 allowances remain usable with the deprecated methods.
- Prepared vault deposits expire after two hours and enforce the signed permit's deadline; `slippageTolerance` still bounds `maxSharePrice`. Deprecated supply methods retain the legacy Bundler3 execution semantics.
- Prepared supply methods recheck the live provider chain on every call. Handle `ChainIdMismatchError`, re-exported by this package, if the wallet switches away from the configured vault chain.
- Pass an explicit unused `permit2Nonce` to token `get*Requirements` calls, and to the prepared deposit's `getRequirements`, when selecting Permit2 SignatureTransfer.
- Use `prepareWithdraw` for vault withdrawals. VaultBundlesV1 burns the account's vault shares, so the withdrawal now needs a vault-share allowance equal to the SDK's derived share cap — a prerequisite version 1 withdrawals did not have. `withdraw(options)` resolves that requirement before submitting and throws the new `UnresolvedVaultWithdrawRequirementsError` unless the exact allowance is already in place.
- Recreate cached vault-share approvals. The new spender is VaultBundlesV1, and an allowance that does not equal the derived cap — including a larger leftover approval — is replaced rather than reused, so the per-withdrawal cap holds.
- Constructor-level `slippageTolerance` now also bounds vault withdrawals: it widens the derived share cap the same way it widens the vault-deposit share-price bound.
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
  Deprecated vault supplies narrow their option-level signature to `PermitRequirementSignature`,
  accepting only ERC-2612/Permit2 AllowanceTransfer permits. If a signature variable is typed as
  the broader `RequirementSignature`, narrow it with `isPermitSignature` from
  `@morpho-org/morpho-sdk` before passing it to `supply` or `quoteSupply`. They return
  `ApprovalOrSignatureRequirement` from `getSupplyRequirements`, including Permit2 AllowanceTransfer.

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

## Vault withdrawal share requirements

```ts
const prepared = await morpho.prepareWithdraw({ token, amount: 1_000_000n });
const requirements = await prepared.getRequirements();

const requirement = requirements[0];
if (requirement && "sign" in requirement) {
  const requirementSignature = await requirement.sign(walletClient, userAddress);
  const quote = await prepared.quote(requirementSignature); // { fee: bigint }
  await prepared.submit(requirementSignature);
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
  const quote = await prepared.quote(); // { fee: bigint }
  await prepared.submit();
}
```

`getRequirements()` re-validates the withdrawal deadline on every call, so a prepared withdrawal
reused after its deadline throws `ExpiredDeadlineError` instead of returning stale prerequisites.

The share allowance is the only cap on how many shares the exit burns, so `withdraw(options)`
resolves the same requirement before submitting and throws
`UnresolvedVaultWithdrawRequirementsError` when one is outstanding — including when a larger
leftover allowance would let a share-price loss burn past the derived cap.

`quoteWithdraw(options)` and unsigned `prepared.quote()` also check the exact share allowance
before estimating gas and throw `UnresolvedVaultWithdrawRequirementsError` when it is outstanding.
For a first withdrawal, satisfy the requirements and quote through the same prepared handle as
shown above, so the quote uses the approved share cap or the corresponding signed permit.
All three prepared methods (`getRequirements`, `quote`, and `submit`) re-read the provider chain
before using the captured action and throw `ChainIdMismatchError` after a switch away from the
configured vault chain.

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

Deprecated flow, supported throughout 2.x:

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

Recommended prepared flow:

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
