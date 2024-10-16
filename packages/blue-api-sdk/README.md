# @morpho-org/blue-api-sdk

<a href="https://www.npmjs.com/package/@morpho-org/blue-api-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/blue-api-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/blue-api-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/wevm/@morpho-org/blue-api-sdk/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/blue-api-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/blue-api-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/blue-api-sdk">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/blue-api-sdk?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/blue-api-sdk?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

GraphQL SDK that exports types from the [API's GraphQL schema](https://blue-api.morpho.org/graphql) and a useful Apollo cache controller.

## Installation

```bash
npm install @morpho-org/blue-api-sdk
```

```bash
yarn add @morpho-org/blue-api-sdk
```

## Getting Started

### Codegen

Create a `codegen.ts` file and define your desired preset & plugins, importing types from `@morpho-org/blue-api-sdk`. Below is given 3 typically recommended configurations:

#### Recommended [near-operation-file](https://the-guild.dev/graphql/codegen/plugins/presets/near-operation-file-preset) preset config

```typescript
import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const config: CodegenConfig = {
  ...,
  schema: BLUE_API_GRAPHQL_URL,
  documents: ["src/graphql/**/*.{query,fragment}.gql"],
  generates: {
    "src/graphql/": {
      ...,
      preset: "near-operation-file",
      presetConfig: {
        baseTypesPath: "~@morpho-org/blue-api-sdk",
      },
    },
  },
};

export default config;
```

#### Recommended [import-types](https://the-guild.dev/graphql/codegen/plugins/presets/import-types-preset) preset config

```typescript
import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const config: CodegenConfig = {
  ...,
  schema: BLUE_API_GRAPHQL_URL,
  documents: ["graphql/*.{query,fragment}.gql"],
  generates: {
    "src/api/types.ts": {
      ...,
      preset: "import-types",
      presetConfig: {
        typesPath: "@morpho-org/blue-api-sdk",
      },
    },
  },
};
```

#### Recommended [typescript-operations](https://the-guild.dev/graphql/codegen/plugins/typescript-operations) plugin config

```typescript
import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const config: CodegenConfig = {
  ...,
  schema: BLUE_API_GRAPHQL_URL,
  generates: {
    [...]: {
      plugins: ["typescript-operations", ...],
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
