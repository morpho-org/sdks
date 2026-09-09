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

Retain WDK `supply`, `getSupplyRequirements`, `quoteSupply`, `MorphoSupplyOptions`,
`MorphoErc20SupplyOptions`, and `MorphoNativeSupplyOptions` as deprecated compatibility APIs
throughout 2.x, with removal deferred to 3.0. The compatibility methods preserve Bundler3 funding,
GeneralAdapter1 approvals, additive native/ERC-20 amounts, and ERC-2612/Permit2 AllowanceTransfer
signatures. Use `prepareSupply` for the new VaultBundlesV1 route.

Narrow the legacy WDK supply options' `requirementSignature` to `PermitRequirementSignature`,
matching the supported ERC-2612 and Permit2 AllowanceTransfer permits. Callers holding the broader
`RequirementSignature` union must narrow it before supplying a legacy vault deposit signature.

Reject vault deposit funding and share-price bounds above uint256 with `InputExceedsMaxError`.
Prepared Vault V1/V2 deposits reject oversized native amounts before returning requirements.

WDK prepared supplies reject zero ERC-20/native funding with `NonPositiveInputError` and negative
funding with `NegativeInputError` before fetching vault data or constructing the deposit.
