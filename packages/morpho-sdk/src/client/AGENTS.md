# `client/`

Entry point of the SDK. `MorphoClient` wraps a viem **`PublicClient`** and exposes vault/market accessors. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Client contract

- Input is viem's `PublicClient`. Chain is checked at runtime (`validateChainId(viemClient.chain?.id, chainId)`); account is never read.
- Used for: on-chain reads, building transactions, fetching nonces / token data.
- Signing happens elsewhere: pass a viem `WalletClient` to `Requirement.sign(client, userAddress)` (see [`src/actions/AGENTS.md`](../actions/AGENTS.md)).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.marketV1(marketParams, chainId) → MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.
