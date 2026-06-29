---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Add offchain `setAuthorizationWithSig` support for Morpho Blue bundled paths and switch entity `buildTx` to accept an array of signatures.

When the client opts into offchain signatures (`supportSignature: true`), `getRequirements()` on the authorization-bearing Blue paths (`borrow`, `withdraw`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `refinance`) now returns a signable `Requirement` instead of a standalone `setAuthorization` transaction. Signing it yields an `AuthorizationRequirementSignature` that `buildTx` folds into the bundle as a `setAuthorizationWithSig` call, so GeneralAdapter1 is authorized in-bundle with no separate onchain transaction.

**Breaking:** every entity `buildTx` now accepts an array of signatures (`buildTx(signatures?: readonly RequirementSignature[])`) instead of a single optional signature. Pass `buildTx([permitSignature])` where you previously passed `buildTx(permitSignature)`; combine the permit and authorization signatures in the same array for paths that need both (e.g. `supplyCollateralBorrow`). The array is split internally via the new `isPermitSignature` / `isAuthorizationSignature` type guards. `RequirementSignature` is now the discriminated union `PermitRequirementSignature | AuthorizationRequirementSignature`, and `Requirement<T>` is generic over the signature it produces.

New public surface: `AuthorizationAction`, `AuthorizationSignatureArgs`, `AuthorizationRequirementSignature`, `PermitRequirementSignature`, `isPermitSignature`, `isAuthorizationSignature`, `encodeAuthorization`, `getAuthorizationAction`, the `morphoSetAuthorizationWithSig` bundler action, and `BundlerErrors.UnexpectedSignature`. `getMorphoAuthorizationRequirement` gains a `supportSignature` option.

`@morpho-org/wdk-protocol-lending-morpho-evm` is updated to pass single signatures as arrays to `buildTx` and widens `getBorrowRequirements` to surface the new signable authorization requirement.
