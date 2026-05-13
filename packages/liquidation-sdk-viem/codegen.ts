import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const hexStringScalar = "`0x$" + "{string}`";

const config: CodegenConfig = {
  overwrite: true,
  schema: BLUE_API_GRAPHQL_URL,
  documents: ["graphql/*.{query,fragment}.gql"],
  generates: {
    "src/api/types.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: {
          field: true,
          inputValue: false,
          defaultValue: true,
        },
        scalars: {
          BigInt: {
            input: "string | number",
            output: "bigint",
          },
          HexString: {
            input: "string",
            output: hexStringScalar,
          },
          Address: {
            input: "string",
            output: "@morpho-org/blue-sdk#Address",
          },
          MarketId: {
            input: "string",
            output: "@morpho-org/blue-sdk#MarketId",
          },
        },
      },
    },
    "src/api/sdk.ts": {
      plugins: ["typescript-graphql-request"],
      preset: "import-types",
      presetConfig: {
        typesPath: "./types.js",
      },
    },
  },
};

export default config;
