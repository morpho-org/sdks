---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Route Vault V1 and Vault V2 deposits through VaultBundlesV1, including exclusive ERC-20/native funding, referral fees, prepared requirement handles, and fixed-bundle token signatures.

Native vault deposits reject token permits with `UnexpectedRequirementSignatureError`. WDK
collateral supply, requirement, and quote methods consistently reject mixed funding with
`MixedBlueCollateralFundingError`.

Refresh prepared vault requirements after each settled read while deduplicating concurrent calls.
WDK prepared supplies revalidate the live provider chain before resolving requirements, quoting,
or submitting, and expose the shared `ChainIdMismatchError` for chain mismatches.

Remove the WDK Bundler3 vault-supply compatibility route, `getSupplyRequirements`, and
the `MorphoSupplyOptions`,
`MorphoErc20SupplyOptions`, `MorphoNativeSupplyOptions`, and `ApprovalOrSignatureRequirement`
exports. The standard WDK `supply` and `quoteSupply` methods now use VaultBundlesV1 with
exclusive funding and existing approvals. Use `MorphoExclusiveSupplyOptions` with
`prepareSupply` and its `getRequirements`,
`submit`, and `quote` methods. Existing GeneralAdapter1 approvals, additive ERC-20/native funding,
and Permit2 AllowanceTransfer signatures are no longer supported for vault deposits.

Reject vault deposit funding and share-price bounds above uint256 with `InputExceedsMaxError`.
Prepared Vault V1/V2 deposits reject oversized native amounts before returning requirements.

WDK prepared supplies reject zero ERC-20/native funding with `NonPositiveInputError` and negative
funding with `NegativeInputError` before fetching vault data or constructing the deposit.

WDK `prepareSupply` throws `VaultAssetMismatchError` when the supplied token differs from the
configured vault asset.
