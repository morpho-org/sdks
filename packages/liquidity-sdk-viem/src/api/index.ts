import { GraphQLClient } from "graphql-request";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

import { getSdk } from "./sdk.js";

export * from "./sdk.js";
export * from "./types.js";

export const apiSdk = getSdk(new GraphQLClient(BLUE_API_GRAPHQL_URL));
