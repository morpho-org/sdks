---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Return exact vault-share approvals for writable and read-only ERC-4337 withdrawal accounts even when `supportSignature` is enabled. WDK's underlying EOA signature cannot authorize an ERC-2612 permit owned by the Safe. Preserve EOA withdrawal permits and signature configuration for other operations.
