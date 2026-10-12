# Migrating from midnight-sdk v1 to v2

midnight-sdk v2 removes `midnightBundlesAbi` (MidnightBundles V1). Use `midnightBundlesV2Abi`
against the `midnightBundlesV2` address. V2 acts for `msg.sender` (no `taker` argument), takes no
inline token permits, and takes the `Market` struct as its first argument; the README's atomic-take
recipe shows the V2 call. Integrations that still call V1 must pin midnight-sdk v1.
