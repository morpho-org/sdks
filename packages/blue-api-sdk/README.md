# @morpho-org/blue-api-sdk

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]

Useful utility package to easily integrate Morpho's GraphQL API either on a raw client or through Apollo.

## Install

```bash
npm install @morpho-org/blue-api-sdk
```

```bash
yarn add @morpho-org/blue-api-sdk
```

---

## Getting Started

### Codegen

Create a `codegen.ts` file using the [near-operation-file](https://the-guild.dev/graphql/codegen/plugins/presets/near-operation-file-preset) preset and define your desired plugins:

```typescript
import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const config: CodegenConfig = {
  overwrite: true,
  schema: BLUE_API_GRAPHQL_URL,
  documents: ["src/graphql/**/*.query.gql", "src/graphql/**/*.fragment.gql"],
  generates: {
    "src/graphql/": {
      preset: "near-operation-file",
      plugins: ["typescript-operations", "typescript-react-apollo"],
      presetConfig: {
        baseTypesPath: "~@morpho-org/blue-api-sdk",
      },
      config: {
        avoidOptionals: {
          field: true,
          inputValue: false,
          defaultValue: true,
        },
        scalars: {
          BigInt: {
            input: `Types.Scalars["BigInt"]["input"]`,
            output: `Types.Scalars["BigInt"]["output"]`,
          },
          HexString: {
            input: `Types.Scalars["HexString"]["input"]`,
            output: `Types.Scalars["HexString"]["output"]`,
          },
          Address: {
            input: `Types.Scalars["Address"]["input"]`,
            output: `Types.Scalars["Address"]["output"]`,
          },
          MarketId: {
            input: `Types.Scalars["MarketId"]["input"]`,
            output: `Types.Scalars["MarketId"]["output"]`,
          },
        },
      },
    },
  },
};

export default config;
```

### Apollo

Define an Apollo cache to use and specify the cache type policies exported from this package:

```typescript
import { typePolicies } from "@morpho-org/blue-api-sdk";

// Apollo InMemoryCache needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export const inMemoryCache = new InMemoryCache({ typePolicies });
```
