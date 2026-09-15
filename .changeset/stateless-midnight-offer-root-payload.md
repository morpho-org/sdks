---
"@morpho-org/morpho-sdk": patch
---

Make Midnight maker offer submission stateless: `buildSubmitOffersTx` now reads the encoded offer-root payload from the `RequirementSignature` it is handed (`signature.args.payload`) instead of an in-memory `Map` that `sign()` had to populate on the same entity instance. This lets a maker offer-root requirement be signed on one `MorphoMidnight` instance and submitted from another (prepare-on-A → finalize-on-B), which previously threw `UnpreparedMidnightOfferRootSignatureError`. That error is now thrown only when the supplied signature carries no payload.
