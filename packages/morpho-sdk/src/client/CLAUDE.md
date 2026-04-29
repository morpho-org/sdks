# Client Layer

> Full context: [CLAUDE.md](../../CLAUDE.md)

Entry point of the SDK. `MorphoClient` wraps a viem `Client` and exposes vault/market accessors.

## Intent

- Manages SDK options: `supportSignature`, `supportDeployless`, `metadata`.
- Factory for entities:
  - `client.vaultV1(address, chainId)` → `MorphoVaultV1`
  - `client.vaultV2(address, chainId)` → `MorphoVaultV2`
  - `client.marketV1(marketParams, chainId)` → `MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly.

## Key Constraint

All options are `readonly`. Do not add mutable state here.
