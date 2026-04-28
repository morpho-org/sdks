# blue-sdk-viem Conventions

- Fetchers accept a `viem` `Client` and return `blue-sdk` classes, e.g. `fetchMarket(id, client)`.
- Default deployless reads to `true`; fall back to multicall unless `deployless === "force"`.
- Set missing chain IDs from the client: `parameters.chainId ??= await getChainId(client)`.
- Keep generated deployless query artifacts as `abi` and `code` constants under `src/queries`.
- Augment classes only in `src/augment`, e.g. `Market.fetch = fetchMarket`.
- Use `readContractRestructured` when tuple fields should map to named object properties.
- Fetch params pass through viem call fields: `account`, `blockNumber`, `blockTag`, `stateOverride`.
- Normalize unsafe user addresses with `safeGetAddress`, not lowercasing alone.
- Typed-data helpers return `TypedDataDefinition`, e.g. `getPermitTypedData(...)`.
