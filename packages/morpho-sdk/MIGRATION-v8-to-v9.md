# Migrating from morpho-sdk v8 to v9

Version 9 removes exact-amount approval controls. Classic ERC-20 approvals and vault-share
approvals or permits now use `maxUint256` when the existing allowance is below the required amount.
An allowance at or above the required amount satisfies the requirement; larger leftovers are
reused. `MAX_TOKEN_APPROVALS`, USDT-style zero-reset behavior, and spender allowlists remain.

## Removed and retyped inputs

Remove `approvalAmount` from these public inputs:

| Before | After |
| --- | --- |
| `BlueTokenRequirementsParams.approvalAmount` | Remove the property. |
| `GetBundlesTokenRequirementsParams.approvalAmount` | Remove the property; approvals no longer default to the pull amount. |
| `GetMidnightApprovalRequirementsParams.approvalAmount` | Remove the property. |
| `MidnightRequirementsParams.approvalAmount` | Use the retyped requirements params without the approval amount. |
| `RequirementOptions.approvalAmount` | Remove the property from WDK requirements options. |
| `EncodeVaultSharesPermitParams.amount` | Remove the property; vault-share permits authorize `maxUint256`. |

JavaScript callers that keep passing `approvalAmount` will not receive a warning: the extra
property is silently ignored and the SDK may return an unlimited approval when one is needed.
Remove the option rather than relying on the former exact-amount behavior.

`getRequirementsApproval` no longer accepts an `approvalAmount` argument. Call it with the token,
spender, spend amount, and current allowance; when the allowance is insufficient it returns an
approval for the maximum amount allowed by the token's cap. The USDT-style zero-reset requirement
and spender validation are unchanged.

`BundlesTokenRequirementsState`'s approval branch no longer includes an `approvalAmount` field.
Update serialized or constructed state to match the retyped branch.

## Removed error and share-allowance ceiling

`ApprovalAmountLessThanSpendAmountError` is removed from `morpho-sdk` and is no longer re-exported
by WDK. Remove catches and imports for this error.

Share authorization now requires only the SDK-derived minimum share allowance. A larger existing
allowance is reused instead of being reset to a ceiling, while an insufficient allowance is raised by an unlimited classic approval or vault-share permit.

## Permit and exit behavior

ERC-2612 token permits and Permit2 SignatureTransfer remain exact because the deployed bundles
pass the pull amount to `permit` or derive the signed transfer permission from that same amount.
Vault-share permits use `maxUint256`; their signature checks still require a signed value at least
as large as the needed share amount.

The former bounded VaultBundlesV1 share allowance capped how many shares an asset-mode exit could
burn, even though the bundle itself had no share-price or max-shares bound. V9 removes that cap.
Asset-mode `vaultBundlesV1Withdraw`, the asset-mode V1 `migrateToV2` source leg, and in-kind
redemption have no on-chain share-price or max-shares bound. With an unlimited share allowance, a
share-price drop before inclusion can burn more shares than quoted. Vault V2 `forceWithdraw` retains its
`minSharePriceE27` bound, shares-mode redemption burns its fixed share amount, and deposit or
migration-destination operations retain `maxSharePrice`.
