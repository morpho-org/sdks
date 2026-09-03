# Migrating to 2.0

Version 2 routes Morpho Blue writes through `BlueBundlesV1` and Vault V2 earn writes through
`VaultBundlesV1` instead of Bundler3 or direct ERC-4626 calls.

## Required changes

- Replace Vault V1 borrow reallocations with `VaultV2BlueReallocation` values on `MorphoBorrowOptions.reallocations`.
- Replace `MorphoBorrowWithVaultV2ReallocationsOptions` with `MorphoBorrowOptions`. The specialized opt-in type and the package's Vault V1 reallocation re-exports were removed.
- Remove `slippageTolerance` from `MorphoBorrowOptions`, `MorphoRepayOptions`, and Blue collateral-supply inputs. Constructor-level and vault-supply slippage settings now apply only to Morpho Vault V2 flows because BlueBundlesV1 has no Bundler3 share-price bounds.
- Call `getWithdrawCollateralRequirements` before `withdrawCollateral`. Send the returned authorization transaction, or sign the requirement and pass its result as `requirementSignature`.
- Use `MorphoCollateralSupplyOptions` for Blue collateral methods and
  `MorphoExclusiveSupplyOptions` for vault deposits. Both accept either `amount` or
  `nativeAmount`, never both. Split a former additive native + wrapped-native deposit into two
  transactions.
- Use `prepareSupply` and `prepareWithdraw` whenever a vault operation needs requirements. Resolve
  and satisfy the prepared handle's requirements, then call that same handle's `submit`; do not
  recreate the operation through `supply` or `withdraw` after signing.
- Pass an explicit unused `permit2Nonce` to token `get*Requirements` calls when selecting Permit2 SignatureTransfer.
- Recreate cached approvals and Morpho authorizations for Blue writes. Their spender and authorization target is now BlueBundlesV1 instead of GeneralAdapter1.
- Blue writes now expire after two hours instead of using an unbounded deadline; signed calls preserve the requirement signature's deadline.
- With signatures disabled, `getRepayRequirements({ amount: "max" })` may return the token's
  reusable maximum approval; the later BlueBundlesV1 transaction still uses a bounded funding cap
  and refunds excess.

## TypeScript output changes

- Prepared-handle `getRequirements()` returns a readonly array. Treat it as an immutable result instead of
  pushing requirements into it.
- `RequirementApproval` and `RequirementAuthorization` are readonly transactions.
- `RequirementSignatureRequest<TSignature>` is now generic. Vault token requirements use
  `PermitRequirementSignature`, Blue token requirements use
  `BundlesTokenRequirementSignature`, and Blue authorization requirements use
  `AuthorizationRequirementSignature`.
- Use `BundlesApprovalOrSignatureRequirement` for vault deposits,
  `BlueApprovalOrSignatureRequirement` for Blue token-funded writes, and
  `AuthorizationOrSignatureRequirement` for Blue borrow or withdrawal authorization.
- Vault token and share signatures move from the intent options to `PreparedMorphoSupply.submit`
  and `PreparedMorphoWithdraw.submit`. Blue signatures remain narrowed on
  `MorphoCollateralSupplyOptions`, `MorphoBorrowOptions`, `MorphoRepayOptions`, and
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

## Vault supply and withdrawal

```ts
const supply = {
  token: vaultAsset,
  amount: 1_000_000n,
} satisfies MorphoExclusiveSupplyOptions;
const preparedSupply = await morpho.prepareSupply(supply);
// With `supportSignature`, Permit2 returns an ERC-20 approval for canonical Permit2 *and* a
// SignatureTransfer request, so send every transaction and keep the signature for `submit`.
let supplySignature: BundlesTokenRequirementSignature | undefined;
for (const requirement of await preparedSupply.getRequirements({ permit2Nonce })) {
  if ("sign" in requirement) {
    supplySignature = await requirement.sign(walletClient, userAddress);
  } else {
    await account.sendTransaction(requirement);
  }
}
await preparedSupply.submit(supplySignature);

const withdrawal = { token: vaultAsset, amount: 1_000_000n };
const preparedWithdrawal = await morpho.prepareWithdraw(withdrawal);
const requirements = await preparedWithdrawal.getRequirements();
const signatureRequest = requirements.find(
  (requirement) => "sign" in requirement,
);

if (signatureRequest) {
  const requirementSignature = await signatureRequest.sign(
    walletClient,
    userAddress,
  );
  await preparedWithdrawal.submit(requirementSignature);
} else {
  for (const transaction of requirements) {
    await account.sendTransaction(transaction);
  }
  await preparedWithdrawal.submit();
}
```

`repay({ amount: "max" })` now uses BlueBundlesV1's saturated full-repay mode, so it closes the live remaining debt even if the borrow-share balance decreases before execution.
