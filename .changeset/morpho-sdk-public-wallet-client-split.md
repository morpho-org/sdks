---
"@morpho-org/morpho-sdk": minor
---

Split public/wallet client roles. `MorphoClient` now takes viem's bare `PublicClient` (used for reads and tx building only — `account` is ignored), and `Requirement.sign(client, userAddress)` takes a bare `WalletClient`. Sign callbacks validate at call time in this order: `chain.id === expected chainId`, `account` is set, `account.address === userAddress`. The entity-build-time `validateUserAddress` invariant has moved to sign time — flows that return zero permit / permit2 requirements (sufficient allowance, `supportSignature: false`, `setAuthorization`-only) no longer enforce a builder = signer match; the integrator owns the `userAddress = msg.sender` invariant on those paths (per BUNDLER3.md). `validateChainId` now throws unconditionally on undefined `chain.id` in V1/V2 entity reads. Removes the unused `ERC20PermitAction` interface; adds `readonly` on `Requirement`, `RequirementSignature`, `PermitArgs`, `Permit2Args` fields.
