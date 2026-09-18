/** Root Morpho domain used to derive public service URLs. */
export const MORPHO_DOMAIN = "morpho.org";

/**
 * Builds an HTTPS base URL for a Morpho subdomain.
 *
 * @param subDomain - Subdomain label to prefix before `morpho.org`.
 * @returns The HTTPS base URL for the requested subdomain.
 * @example
 * ```ts
 * import { getSubdomainBaseUrl } from "@morpho-org/morpho-ts";
 *
 * const url = getSubdomainBaseUrl("docs");
 * // "https://docs.morpho.org"
 * ```
 */
export const getSubdomainBaseUrl = (subDomain: string) =>
  `https://${subDomain}.${MORPHO_DOMAIN}`;

/** Base URL for Morpho documentation. */
export const DOCS_BASE_URL = getSubdomainBaseUrl("docs");

/** Base URL for the Morpho Blue API. */
export const BLUE_API_BASE_URL = getSubdomainBaseUrl("api");

/** Base URL for Morpho campaigns pages. */
export const REWARDS_BASE_URL = getSubdomainBaseUrl("campaigns");

/** GraphQL endpoint URL for the Morpho Blue API. */
export const BLUE_API_GRAPHQL_URL = new URL(
  "/graphql",
  BLUE_API_BASE_URL,
).toString();
