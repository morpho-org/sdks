---
"@morpho-org/morpho-sdk": major
---

Split public/wallet client roles.

**Retypes (breaking):**
- `MorphoClient` constructor: `Client` → `PublicClient`.
- `MorphoClientType.viemClient`: `Client` → `PublicClient`.
- `morphoViemExtension`: `<TClient extends Client>` → `<TClient extends PublicClient>`.
- `Requirement.sign(client, userAddress)`: `Client` → `WalletClient`.
- `getRequirements`, `getRequirementsPermit`, `encodeErc20Permit`, `encodeErc20Permit2`, `getMorphoAuthorizationRequirement`: client parameters retyped to `PublicClient` / `WalletClient` accordingly.

**Removed (breaking):**
- `ERC20PermitAction` interface (was barrel-exported through `types/index.ts`; replaced by `Requirement` / `RequirementSignature`).

**Behavior changes (breaking):**
- The entity-build-time `validateUserAddress` invariant moved to sign time — flows that return zero permit / permit2 requirements (sufficient allowance, `supportSignature: false`, `setAuthorization`-only) no longer enforce a builder = signer match. The integrator owns the `userAddress = msg.sender` invariant on those paths (per BUNDLER3.md).
- Sign callbacks now validate at call time in this order: `chain.id === expected chainId`, `account` is set, `account.address === userAddress`.
- `validateChainId` now throws unconditionally on undefined `chain.id` in V1/V2 entity reads (previously tolerated chain-less public clients on read-only paths).
- `readonly` added on every field of `Requirement`, `RequirementSignature`, `PermitArgs`, `Permit2Args`. Strict-TS code that wrote those fields will no longer compile.
