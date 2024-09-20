import { GraphQLClient } from "graphql-request";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

import { getSdk } from "./sdk";

export * from "./sdk";
export * from "./types";

export const apiSdk: ReturnType<typeof getSdk> = getSdk(
  new GraphQLClient(BLUE_API_GRAPHQL_URL),
);
