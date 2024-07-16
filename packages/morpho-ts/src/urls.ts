export const MORPHO_DOMAIN = "morpho.org";

export const getSubdomainBaseUrl = (subDomain: string) =>
  `https://${subDomain}.${MORPHO_DOMAIN}`;

export const CDN_BASE_URL = getSubdomainBaseUrl("cdn");
export const DOCS_BASE_URL = getSubdomainBaseUrl("docs");
export const BLUE_API_BASE_URL = getSubdomainBaseUrl("blue-api");
export const REWARDS_BASE_URL = getSubdomainBaseUrl("rewards");
export const OPTIMIZERS_BASE_URL = getSubdomainBaseUrl("optimizers");
export const OPTIMIZERS_API_BASE_URL = getSubdomainBaseUrl("api");

export const BLUE_API_GRAPHQL_URL = new URL(
  "/graphql",
  BLUE_API_BASE_URL,
).toString();
