import type { CodegenConfig } from "@graphql-codegen/cli";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

const config: CodegenConfig = {
  overwrite: true,
  schema: BLUE_API_GRAPHQL_URL,
  generates: {
    "./src/types.ts": {
      plugins: ["typescript"],
      config: {
        documentMode: "string",
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
            output: "`0x${string}`",
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
  },
};

export default config;
