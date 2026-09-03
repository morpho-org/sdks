# Migrating to 2.0

Version 2 routes Morpho Blue writes through `BlueBundlesV1` instead of Bundler3, and Morpho vault withdrawals through `VaultBundlesV1` instead of a direct vault call.

## Required changes

- Replace Vault V1 borrow reallocations with `VaultV2BlueReallocation` values on `MorphoBorrowOptions.reallocations`.
- Replace `MorphoBorrowWithVaultV2ReallocationsOptions` with `MorphoBorrowOptions`. The specialized opt-in type and the package's Vault V1 reallocation re-exports were removed.
- Remove `slippageTolerance` from `MorphoBorrowOptions`, `MorphoRepayOptions`, and Blue collateral-supply inputs. Constructor-level and vault-supply slippage settings now apply only to Morpho Vault V2 flows because BlueBundlesV1 has no Bundler3 share-price bounds.
- Call `getWithdrawCollateralRequirements` before `withdrawCollateral`. Send the returned authorization transaction, or sign the requirement and pass its result as `requirementSignature`.
- Use `prepareWithdraw` for vault withdrawals. VaultBundlesV1 burns the account's vault shares, so the withdrawal now needs a vault-share allowance equal to the SDK's derived share cap — a prerequisite version 1 withdrawals did not have. `withdraw(options)` resolves that requirement before submitting and throws the new `UnresolvedVaultWithdrawRequirementsError` unless the exact allowance is already in place.
- Recreate cached vault-share approvals. The new spender is VaultBundlesV1, and an allowance that does not equal the derived cap — including a larger leftover approval — is replaced rather than reused, so the per-withdrawal cap holds.
- Constructor-level `slippageTolerance` now also bounds vault withdrawals: it widens the derived share cap the same way it widens the vault-deposit share-price bound.
- Use `MorphoCollateralSupplyOptions` for Blue collateral methods. Its type accepts either `amount` or `nativeAmount`, not both; vault deposits still use additive `MorphoSupplyOptions`.
- Pass an explicit unused `permit2Nonce` to token `get*Requirements` calls when selecting Permit2 SignatureTransfer.
- Recreate cached approvals and Morpho authorizations for Blue writes. Their spender and authorization target is now BlueBundlesV1 instead of GeneralAdapter1.
- Blue writes now expire after two hours instead of using an unbounded deadline; signed calls preserve the requirement signature's deadline.
- With signatures disabled, `getRepayRequirements({ amount: "max" })` may return the token's
  reusable maximum approval; the later BlueBundlesV1 transaction still uses a bounded funding cap
  and refunds excess.

## TypeScript output changes

- `get*Requirements()` returns a readonly array. Treat it as an immutable result instead of
  pushing requirements into it.
- `RequirementApproval` and `RequirementAuthorization` are readonly transactions.
- `RequirementSignatureRequest<TSignature>` is now generic. Vault token requirements use
  `PermitRequirementSignature`, Blue token requirements use
  `BlueBundlesV1TokenRequirementSignature`, and Blue authorization requirements use
  `AuthorizationRequirementSignature`.
- Use `ApprovalOrSignatureRequirement` for vault deposits,
  `BlueApprovalOrSignatureRequirement` for Blue token-funded writes, and
  `AuthorizationOrSignatureRequirement` for Blue borrow or withdrawal authorization.
- `requirementSignature` is correspondingly narrowed on `MorphoSupplyOptions`,
  `MorphoCollateralSupplyOptions`, `MorphoBorrowOptions`, `MorphoRepayOptions`, and the new
  `MorphoWithdrawCollateralOptions`.

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
  await prepared.submit();
}
```

`getRequirements()` re-validates the withdrawal deadline on every call, so a prepared withdrawal
reused after its deadline throws `ExpiredDeadlineError` instead of returning stale prerequisites.

The share allowance is the only cap on how many shares the exit burns, so `withdraw(options)`
resolves the same requirement before submitting and throws
`UnresolvedVaultWithdrawRequirementsError` when one is outstanding — including when a larger
leftover allowance would let a share-price loss burn past the derived cap.

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

`repay({ amount: "max" })` now uses BlueBundlesV1's saturated full-repay mode, so it closes the live remaining debt even if the borrow-share balance decreases before execution.
