---
"@morpho-org/morpho-sdk": patch
---

Pin the `authorized` operator to the chain's registered BlueBundlesV1 deployment in
`encodeBlueSignatureAuthorization`. Previously the encoder embedded any caller-supplied
`authorized` address into the Morpho `Authorization` EIP-712 payload, so a direct caller could be
walked through signing an authorization that grants an arbitrary address full control over the
signer's Morpho positions. It now throws `UnsupportedAuthorizationOperatorError` up front —
matching the `getBlueAuthorizationRequirement` resolver, which already enforced this on every
in-SDK route — for grant and revocation payloads alike.
