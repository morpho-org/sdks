---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
---

Add guarded batch offer-group cancellation through MidnightBundlesV2. `midnight-sdk` exports `midnightBundlesV2Abi` (bundles commit `07f293b3`), `morpho-ts` adds the optional `midnightBundlesV2` registry key, and `morpho-sdk` adds `client.morpho.midnight(chainId).cancelOffers({ accountAddress, cancellations, deadline })` and the `midnightCancelAndMake` builder. Each `{ group, maxConsumed }` entry marks the group fully consumed for `msg.sender`; the whole transaction reverts with `ConsumedAboveMax` if any group's consumption exceeds its ceiling. No root is published, no assets are parked, and no collateral moves. MidnightBundlesV2 is also accepted as a Midnight authorization target. No chain registers `midnightBundlesV2` yet; register a deployment with `registerCustomAddresses` to use it. New errors: `EmptyMidnightGroupCancellationsError`, `DuplicateMidnightGroupCancellationError`.
