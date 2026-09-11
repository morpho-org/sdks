---
"@morpho-org/morpho-sdk": major
---

Route Vault V1 and Vault V2 share redemptions and Vault V1-to-V2 migrations through VaultBundlesV1 with exact share requirements, referral fees, deadlines, and destination price protection.

Snapshot redemption shares and owner at handle creation so later input mutations cannot change the transaction or invalidate its approval or permit requirements.

Refresh redemption allowances and permit nonces on every requirements call, discard stale permits after satisfied requirements, and snapshot migration identities and permit domains at handle creation.
