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
