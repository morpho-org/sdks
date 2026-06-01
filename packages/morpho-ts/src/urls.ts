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

/**
 * Base URL for Morpho CDN assets.
 *
 * @deprecated Use asset URLs provided by the consuming service instead.
 */
export const CDN_BASE_URL = getSubdomainBaseUrl("cdn");

/** Base URL for Morpho documentation. */
export const DOCS_BASE_URL = getSubdomainBaseUrl("docs");

/** Base URL for the Morpho Blue API. */
export const BLUE_API_BASE_URL = getSubdomainBaseUrl("api");

/** Base URL for Morpho campaigns pages. */
export const REWARDS_BASE_URL = getSubdomainBaseUrl("campaigns");

/**
 * Base URL for Morpho optimizer pages.
 *
 * @deprecated Use optimizer URLs provided by the consuming service instead.
 */
export const OPTIMIZERS_BASE_URL = getSubdomainBaseUrl("optimizers");

/**
 * Base URL for the Morpho optimizers API.
 *
 * @deprecated Use optimizer API URLs provided by the consuming service instead.
 */
export const OPTIMIZERS_API_BASE_URL = getSubdomainBaseUrl("api");

/** GraphQL endpoint URL for the Morpho Blue API. */
export const BLUE_API_GRAPHQL_URL = new URL(
  "/graphql",
  BLUE_API_BASE_URL,
).toString();
