---
"@morpho-org/morpho-ts": patch
---

Fix malformed `explorerUrl` values in `ChainUtils.CHAIN_METADATA`. Arc mainnet (5042) pointed at `http://explorer.arc.io/`, the only non-HTTPS explorer of the 43 registered chains, so every link built from it was an insecure navigation out of an HTTPS app. It is now `https://explorer.arc.io`. The trailing slash is also dropped from Tac, Celo, Abstract and Soneium so all 43 entries match the bare-origin convention and consumers concatenating `/tx/<hash>` or `/address/<addr>` no longer produce a double slash.
