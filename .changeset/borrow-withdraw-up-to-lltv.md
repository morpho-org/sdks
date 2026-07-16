---
"@morpho-org/morpho-sdk": minor
---

Allow borrowing and withdrawing collateral up to (just under) the market LLTV.

`validatePositionHealth` and `validatePositionHealthAfterWithdraw` previously rejected any resulting position above `LLTV − DEFAULT_LLTV_BUFFER` (0.5%). They now only reject positions that would reach or exceed the true LLTV (i.e. become immediately liquidatable), keeping the `+ 1n` share-to-asset rounding guard so a position is never built at or above LLTV.

The 0.5% buffer is no longer enforced by the transaction builders. It remains exported as `DEFAULT_LLTV_BUFFER` as a recommended UI default (e.g. a "max borrow" button), so integrators can let users opt into borrowing closer to LLTV behind an explicit risk acknowledgment. The `BorrowExceedsSafeLtvError` message was updated to match.
