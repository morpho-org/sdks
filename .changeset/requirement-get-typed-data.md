---
"@morpho-org/morpho-sdk": major
---

Expose the EIP-712 payload of every signature `Requirement` as `action.typedData`, so integrators
can inspect or display the exact typed data before it is signed by the built-in
`Requirement.sign(client, userAddress)`.

Each signable requirement action — ERC-2612 permit (`PermitAction`), Permit2 AllowanceTransfer
(`Permit2Action`), Permit2 SignatureTransfer (`Permit2SignatureTransferAction`), Morpho
authorization (`AuthorizationAction`), and the Midnight offer-root
(`MidnightOfferRootSignatureAction`) — now carries a `typedData` field holding the exact viem
`TypedDataDefinition` that `sign()` signs. On the `Requirement` returned by `getRequirements()`
the field is typed as required (`RequirementTypedData`) so
`requirement.action.typedData` type-checks under strict TypeScript; it stays optional on the
standalone action interfaces so hand-built action metadata (e.g. test fixtures) need not supply it.
The payload is deep-frozen.

Because the permit/authorization payload embeds the owner, and it is now built when the requirement
is created, two low-level exported encoders take a new required `owner` parameter:
`encodeErc20Permit` and `encodeBlueSignatureAuthorization` (and `getGeneralAdapterRequirementsPermit`
forwards it). Their `sign()` now also rejects a signer that differs from `owner`. All in-SDK
requirement resolvers already supply the owner, so high-level flows are unaffected.
