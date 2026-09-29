---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Expose named Ecrecover, Setter, Price V1, and Rate V1 tree creation requests as the variants of `TreeCreateRequest`. The new tagged construction API no longer depends on the legacy array-based `TreeCreateParams` contract.

Deprecate `TreeCreateParams` and the untagged `Tree.from` and `TreeUtils.buildDescriptor` overloads alongside the already-deprecated `Tree.create(entries)` overload. Keep the old and new construction interfaces available for Ecrecover and Setter without changing existing behavior. Re-export the new request types through the Midnight and qualified entity facades.

Maintain independent tagged Ecrecover and Setter APIs alongside the deprecated `EcrecoverRatifierUtils` and `SetterRatifierUtils` legacy APIs. The new `*Request` contracts require matching tagged trees or portable snapshots; the old `*Params` contracts and untagged inputs remain available. Keep codec behavior and signature/payload bytes identical, and expose request types through the protocol and qualified type facades.
