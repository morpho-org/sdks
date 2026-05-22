/**
 * @typedef {Object} Vault
 * @property {string} address - The vault's address.
 * @property {string} name - The vault's display name.
 * @property {number} chainId - The identifier of the chain that hosts the vault.
 */
/**
 * A map of curated Morpho Vault V2 presets.
 *
 * @readonly
 * @type {Record<string, Vault>}
 */
export const MORPHO_VAULT_PRESETS: Record<string, Vault>;
/**
 * @typedef {Object} Market
 * @property {string} marketId - The Morpho Blue market identifier.
 * @property {string} collateralSymbol - The symbol of the market collateral token.
 * @property {string} lltv - The loan-to-value ratio.
 * @property {number} chainId - The identifier of the chain that hosts the market.
 */
/**
 * A map of curated Morpho Blue market presets.
 *
 * @readonly
 * @type {Record<string, Market>}
 */
export const MORPHO_MARKET_PRESETS: Record<string, Market>;
export type Vault = {
    /**
     * - The vault's address.
     */
    address: string;
    /**
     * - The vault's display name.
     */
    name: string;
    /**
     * - The identifier of the chain that hosts the vault.
     */
    chainId: number;
};
export type Market = {
    /**
     * - The Morpho Blue market identifier.
     */
    marketId: string;
    /**
     * - The symbol of the market collateral token.
     */
    collateralSymbol: string;
    /**
     * - The loan-to-value ratio.
     */
    lltv: string;
    /**
     * - The identifier of the chain that hosts the market.
     */
    chainId: number;
};
