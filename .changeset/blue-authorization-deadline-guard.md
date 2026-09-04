---
"@morpho-org/morpho-sdk": patch
---

Reject an invalid or already-expired caller-supplied `deadline` in
`encodeBlueSignatureAuthorization` before it prompts the wallet to sign. Previously the encoder
forwarded any `deadline` straight into the EIP-712 authorization, so a direct caller passing a past
or out-of-range deadline was walked through a signing prompt for an authorization Morpho would
reject with `SIGNATURE_EXPIRED`. It now throws `NonPositiveInputError`, `InputExceedsMaxError`, or
`ExpiredDeadlineError` up front — matching the sibling `encodeErc20Permit2TransferFrom` encoder and
the `getBlueAuthorizationRequirement` resolver, which already enforced this on every in-SDK route.
An omitted `deadline` still defaults to two hours from now.
