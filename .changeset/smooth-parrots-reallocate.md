---
"@morpho-org/morpho-sdk": patch
---

Preserve the fetched block timestamp in `ReallocationData` and restore the public allocator target-cap `delay` option (default 1 hour) so source-market withdrawals are evaluated at the fetch timestamp while target-market cap headroom keeps the previous look-ahead behavior.
