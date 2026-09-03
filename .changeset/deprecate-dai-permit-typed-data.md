---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

Deprecate `getDaiPermitTypedData` and `DaiPermitArgs`. The SDK routes DAI approvals through Permit2 / classic approval internally — DAI's non-standard boolean permit (any positive `allowance` authorizes `type(uint256).max`, not the passed amount) is incompatible with the ERC-2612 simple-permit path — so this standalone helper is unused by every SDK flow. It stays exported for one more minor and will be removed in the next major; prefer the Permit2 flow. The `morpho-sdk` facade re-exports (`utils`, `/blue/utils`, `/blue/types`) carry the same `@deprecated` annotation.
