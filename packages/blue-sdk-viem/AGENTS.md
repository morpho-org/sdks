# blue-sdk-viem Conventions

- Fetchers accept a `viem` `Client` and return `blue-sdk` classes, e.g. `fetchMarket(id, client)`.
- Default deployless reads to `true`. Fall back to multicall for eligible read failures unless `deployless === "force"` or `MarketParamsIdMismatchError` indicates a lying RPC. Transport failures classified by `isTransportError` (timeouts, `-32005`, socket or WebSocket failures, HTTP with no status, 408, 429, or status >=500) are rethrown without fallback. Optional reads degrade only for `ContractFunctionRevertedError`, `ContractFunctionZeroDataError`, or node-reported `ExecutionRevertedError` other than a gas-cap rejection via `catchRevertOnly`. For `fetchToken`, optional `name`, `symbol`, and EIP-5267 domain reads degrade to `undefined` only when the call reverts or the contract has no code; a `name`/`symbol` that does not decode as `string` is retried as `bytes32`, and an undecodable `bytes32` retry or `eip712Domain()` result throws `MalformedTokenMetadataError`. A `GetToken` `MalformedReturnData` revert throws `MalformedTokenMetadataError` without fallback in every deployless mode. Transport errors propagate. An absent, undecodable, or out-of-range `decimals()` throws `UnknownTokenError` instead of degrading. This classification list is a public contract.
- Fetchers resolve the chain id from the client; do not add chain id overrides to fetch parameters.
- Keep generated deployless query artifacts as `abi` and `code` constants under `src/queries`.
- Keep non-Blue-specific ABI literals defined in `@morpho-org/morpho-ts` and re-export them from `src/abis.ts` for compatibility. Blue-specific viem ABI literals stay local.
- Augment classes only in `src/augment`, e.g. `Market.fetch = fetchMarket`.
- Keep `fetch/`, `queries/`, and `augment/` names aligned with the matching `blue-sdk` entity names.
- Use `readContractRestructured` when tuple fields should map to named object properties.
- Fetch params pass through viem call fields: `account`, `blockNumber`, `blockTag`, `stateOverride`.
- Normalize unsafe user addresses with `safeGetAddress`, not lowercasing alone.
- Typed-data helpers return `TypedDataDefinition`, e.g. `getPermitTypedData(...)`.
- Re-export ABI literals from `@morpho-org/morpho-ts` when they exist there; keep local ABI declarations only for Blue-specific viem surfaces absent from `morpho-ts`.
- Vault V2 BluePublicAllocator fetchers resolve the chain's single allocator from `vaultV2BluePublicAllocator` in the address registry using the client chain id. The hydrated-vault batch fetch derives supported adapter/market/allocation ids, returns active adapters as a set separate from market configs, defaults to one deployless read, and falls back to direct reads.

## Continuous Improvement

- Keep viem/RPC I/O explicit at this package boundary; core entity classes stay in `blue-sdk`.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed errors and protocol-faithful return types over generic failures or broad abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
