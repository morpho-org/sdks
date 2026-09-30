---
"@morpho-org/evm-simulation": patch
---

Start `eth_simulateV1` in parallel after 40% of `timeoutMs` (or immediately on a Tenderly error) instead of waiting for Tenderly's 60% timeout; the first definitive result wins, Tenderly-only chains get the full timeout, the selected backend and fallback reason are logged, and the Tenderly RPC URL is redacted from error messages.
