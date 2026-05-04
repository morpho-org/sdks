# blue-sdk-viem Conventions

- Fetchers accept a `viem` `Client` and return `blue-sdk` classes, e.g. `fetchMarket(id, client)`.
- Default deployless reads to `true`; fall back to multicall unless `deployless === "force"`.
- Set missing chain IDs from the client: `parameters.chainId ??= await getChainId(client)`.
- Keep generated deployless query artifacts as `abi` and `code` constants under `src/queries`.
- Augment classes only in `src/augment`, e.g. `Market.fetch = fetchMarket`.
- Keep `fetch/`, `queries/`, and `augment/` names aligned with the matching `blue-sdk` entity names.
- Use `readContractRestructured` when tuple fields should map to named object properties.
- Fetch params pass through viem call fields: `account`, `blockNumber`, `blockTag`, `stateOverride`.
- Normalize unsafe user addresses with `safeGetAddress`, not lowercasing alone.
- Typed-data helpers return `TypedDataDefinition`, e.g. `getPermitTypedData(...)`.

## Continuous Improvement

- Keep viem/RPC I/O explicit at this package boundary; core entity classes stay in `blue-sdk`.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed errors and protocol-faithful return types over generic failures or broad abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
