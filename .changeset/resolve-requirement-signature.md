---
"@morpho-org/morpho-sdk": minor
---

Add `resolveRequirementSignature` / `resolveRequirementSignatures` helpers that turn an externally
collected EIP-712 signature plus its signed typed data into a `RequirementSignature` ready for
`ActionOutput.buildTx(...)`.

This closes the stateless prepare/finalize gap: until now `Requirement.sign()` was the only producer
of a `RequirementSignature`, so an integrator that collects the wallet signature out-of-band (e.g.
across two HTTP requests) had no supported way to feed it back into `buildTx` without keeping the live
SDK object or repeating on-chain reads. The new helpers derive every value `buildTx` needs from the
typed data alone — no RPC, no live entity — discriminating on `primaryType` for ERC-2612 `Permit`,
Permit2 `PermitSingle`, and Blue `Authorization` (asset read from `domain.verifyingContract` for
ERC-2612 and `message.details.token` for Permit2). They tolerate JSON-serialized bigints (for
continuation tokens) and verify the signature against the expected signer by default.

New exported errors: `UnsupportedSignatureTypedDataError`, `MalformedSignatureTypedDataError`,
`MissingSignatureOwnerError` (Permit2 requires an explicit `owner`; Midnight offer-root signatures
are out of scope as their encoded payload is not derivable from typed data).
