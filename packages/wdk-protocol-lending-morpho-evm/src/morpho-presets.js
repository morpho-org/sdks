// SPDX-License-Identifier: Apache-2.0

'use strict'

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
export const MORPHO_VAULT_PRESETS = Object.freeze({
  'sky-money-usdt-savings': Object.freeze({
    address: '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11',
    name: 'sky.money USDT Savings',
    chainId: 1
  }),
  'steakhouse-prime-instant': Object.freeze({
    address: '0xbeef003C68896c7D2c3c60d363e8d71a49Ab2bf9',
    name: 'Steakhouse Prime Instant',
    chainId: 1
  })
})

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
export const MORPHO_MARKET_PRESETS = Object.freeze({
  susds: Object.freeze({
    marketId: '0x3274643db77a064abd3bc851de77556a4ad2e2f502f4f0c80845fa8f909ecf0b',
    collateralSymbol: 'sUSDS',
    lltv: '96.5%',
    chainId: 1
  }),
  wsteth: Object.freeze({
    marketId: '0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2',
    collateralSymbol: 'wstETH',
    lltv: '86%',
    chainId: 1
  }),
  wbtc: Object.freeze({
    marketId: '0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99',
    collateralSymbol: 'WBTC',
    lltv: '86%',
    chainId: 1
  }),
  xaut: Object.freeze({
    marketId: '0xb7843fe78e7e7fd3106a1b939645367967d1f986c2e45edb8932ad1896450877',
    collateralSymbol: 'XAUt',
    lltv: '77%',
    chainId: 1
  })
})
