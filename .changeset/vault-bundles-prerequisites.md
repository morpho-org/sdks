---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Generalize the fixed-bundles token requirement surface shared by BlueBundlesV1 and VaultBundlesV1,
including the distinct Permit2 SignatureTransfer discriminator, explicit unordered nonces, canonical
Permit2 approvals, referral-fee math, vault bounds, and registered-spender validation.

Reject out-of-range uint256 pull amounts in the standalone requirement resolver. Share the
canonical `BundleSharesPermit` tuple through the `BundlesSharesPermit` and
`VaultExitBundlesV1PermitStruct` compatibility aliases.

Update the WDK's public token requirement signatures to `BundlesTokenRequirementSignature` from
the new morpho-sdk major.
