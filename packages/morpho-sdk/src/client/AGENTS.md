# `client/`

Entry point of the SDK. `MorphoClient` wraps a viem **`PublicClientWithChain`** (exported from this package: `Client<Transport, Chain>`) and exposes vault/market accessors. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Client contract

- Input is `PublicClientWithChain` (alias for `Client<Transport, Chain>` — chain mandatory). Account is not read.
- Used for: on-chain reads, building transactions, fetching nonces / token data.
- Signing happens elsewhere: pass a `WalletClientWithChain` to `Requirement.sign(client, userAddress)` (see [`src/actions/AGENTS.md`](../actions/AGENTS.md)).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.marketV1(marketParams, chainId) → MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.
