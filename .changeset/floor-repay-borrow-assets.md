---
"@morpho-org/blue-sdk": patch
---

Floor `totalBorrowAssets` at zero in `Market.repay` when a full-share repayment rounds borrow assets up above the market total, instead of throwing a `bigint` underflow. Mirrors the protocol's `zeroFloorSub` accounting.
