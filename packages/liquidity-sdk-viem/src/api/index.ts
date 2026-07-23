import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";
import { GraphQLClient } from "graphql-request";

import { getSdk, type Sdk } from "./sdk.js";

export * as ApiTypes from "./types.js";

export const apiSdk: Sdk = getSdk(new GraphQLClient(BLUE_API_GRAPHQL_URL));
