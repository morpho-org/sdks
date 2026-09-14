---
"@morpho-org/morpho-sdk": major
---

Expose the EIP-712 payload of every signature `Requirement` as `action.typedData`, so integrators
can produce the signature with any signer (`walletClient.signTypedData(...)`,
`account.signTypedData(...)`, or a remote/EIP-712 signer) instead of the built-in
`Requirement.sign(client, userAddress)`.

Each signable requirement action — ERC-2612 permit (`PermitAction`), Permit2 AllowanceTransfer
(`Permit2Action`), Permit2 SignatureTransfer (`Permit2SignatureTransferAction`), Morpho
authorization (`AuthorizationAction`), and the Midnight offer-root
(`MidnightOfferRootSignatureAction`) — now carries a `typedData` field holding the exact viem
`TypedDataDefinition` that `sign()` signs. It is always populated on requirements the SDK returns
from `getRequirements()` (the field is optional only so hand-built action metadata, e.g. test
fixtures, need not supply it). Obtaining the signature via `action.typedData` skips `sign()`'s
recover-and-verify step, so the caller is responsible for verification.

Because the permit/authorization payload embeds the owner, and it is now built when the requirement
is created, two low-level exported encoders take a new required `owner` parameter:
`encodeErc20Permit` and `encodeBlueSignatureAuthorization` (and `getGeneralAdapterRequirementsPermit`
forwards it). Their `sign()` now also rejects a signer that differs from `owner`. All in-SDK
requirement resolvers already supply the owner, so high-level flows are unaffected.
