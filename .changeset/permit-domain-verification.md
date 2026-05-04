---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/bundler-sdk-viem": minor
"@morpho-org/migration-sdk-viem": minor
---

Verify ERC-2612 permit domains on-chain instead of guessing them from token metadata.

`getPermitTypedData` no longer falls back to a hand-maintained `(name, "1" | "2")`
heuristic when EIP-5267 metadata is missing. It either uses an EIP-5267 domain or a
caller-supplied verified domain, otherwise it throws the new
`UnverifiablePermitDomainError`.

A new `getVerifiedPermitDomain(client, params)` helper discovers a token's EIP-712
permit domain by reading its on-chain `DOMAIN_SEPARATOR()` and matching it against
candidate `(name, version)` pairs (defaults: `(token.name, "1" | "2")`, plus optional
`extraCandidates`). It returns `null` when no candidate matches.

`getRequirements` now routes to simple permit only when the domain can be verified
this way; otherwise it falls back to Permit2. The previous behaviour silently signed
a guessed domain, producing a locally valid signature whose on-chain `permit()` call
reverted. `bundler-sdk-viem` and `migration-sdk-viem` permit signers verify the
domain before signing as well.
