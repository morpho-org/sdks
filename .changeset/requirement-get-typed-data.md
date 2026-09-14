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
`TypedDataDefinition` that `sign()` signs. On the `Requirement` returned by `getRequirements()`
the field is typed as required (`RequirementTypedData`) so
`signer.signTypedData(requirement.action.typedData)` type-checks under strict TypeScript; it stays
optional on the standalone action interfaces so hand-built action metadata (e.g. test fixtures)
need not supply it. The payload is deep-frozen.

Every signature `Requirement` also gains `withSignature(signature, userAddress)`, the counterpart
of `sign()` for externally produced signatures. It recovers the signer from `typedData` and throws
`InvalidSignatureError` on mismatch, rejects a `userAddress` that differs from the owner embedded
in ERC-2612 / Morpho-authorization payloads (`AddressMismatchError`), and returns the same
deep-frozen `RequirementSignature` shape as `sign()` so the result feeds straight into `buildTx()`.
For the Midnight offer-root requirement it additionally derives and registers the ratification
payload that `buildTx()` consumes, so external signers no longer need to go through `sign()`.
Verification is offline ECDSA recovery, so the signer must be an EOA (ERC-1271 contract-wallet
signatures are rejected); malformed signatures surface as `InvalidSignatureError` with the parsing
failure as `cause`. The verification helper is exported as `verifyTypedDataSignature`, and
`isRequirementSignature()` now also requires the `withSignature` callback.

Because the permit/authorization payload embeds the owner, and it is now built when the requirement
is created, two low-level exported encoders take a new required `owner` parameter:
`encodeErc20Permit` and `encodeBlueSignatureAuthorization` (and `getGeneralAdapterRequirementsPermit`
forwards it). Their `sign()` now also rejects a signer that differs from `owner`. All in-SDK
requirement resolvers already supply the owner, so high-level flows are unaffected.
