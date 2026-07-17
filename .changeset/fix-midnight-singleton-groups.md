---
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-sdk": patch
---

Derive standalone Midnight offer group IDs with the router-compatible singleton group algorithm across trees, mempool validation, and ratifier helpers.

**Breaking change:** remove the `TreeUtils.buildDescriptor` `preserveStandaloneGroups` option. This escape hatch produced router-incompatible standalone groups and should not have been part of the public API.
