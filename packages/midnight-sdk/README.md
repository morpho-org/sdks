# @morpho-org/midnight-sdk

Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API validation utilities.

## Installation

```bash
npm install @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

```bash
yarn add @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

## Midnight API

Instantiate `MidnightApi` when an integration makes more than one Midnight API call or needs shared
request options. The instance keeps `baseUrl`, `fetch`, headers, credentials, and abort signals in
one place, while the SDK still owns endpoint paths, HTTP methods, request bodies, and response
normalization.

```ts
import { MidnightApi, type TreeInput } from "@morpho-org/midnight-sdk";

const api = new MidnightApi({
  baseUrl: "https://api.morpho.org",
  request: {
    signal: AbortSignal.timeout(10_000),
  },
});

export async function validateMakerTree(tree: TreeInput) {
  const validation = await api.validateMempoolTree({
    chainId: 8453,
    tree,
  });

  if (!validation.valid) {
    // App code maps API validation issues to its own UX or logging.
    console.log(validation.issues);
  }

  return validation;
}

export async function fetchMidnightRules() {
  return api.fetchMempoolRules({ chainIds: [8453] });
}
```

For one-off calls, use the static `MidnightApi` methods directly. They default to
`https://api.morpho.org` unless the call passes a `baseUrl` override:

```ts
import { MidnightApi } from "@morpho-org/midnight-sdk";

const validation = await MidnightApi.validateMempoolPayload({
  chainId: 8453,
  payload,
});

console.log(validation.valid);
```

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks,
and package workflow.

## License

MIT. See [LICENSE](../../LICENSE).
