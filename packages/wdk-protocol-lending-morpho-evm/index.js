// SPDX-License-Identifier: Apache-2.0

'use strict'

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */

/** @typedef {import('@tetherto/wdk-wallet/protocols').BorrowOptions} BorrowOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BorrowResult} BorrowResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupplyOptions} SupplyOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupplyResult} SupplyResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').WithdrawOptions} WithdrawOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').WithdrawResult} WithdrawResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').RepayOptions} RepayOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').RepayResult} RepayResult */

/** @typedef {import('@morpho-org/blue-sdk').InputMarketParams} InputMarketParams */

/** @typedef {import('./src/morpho-presets.js').Vault} Vault */
/** @typedef {import('./src/morpho-presets.js').Market} Market */

/** @typedef {import('./src/morpho-protocol-evm.js').AccountData} AccountData */
/** @typedef {import('./src/morpho-protocol-evm.js').VaultPosition} VaultPosition */
/** @typedef {import('./src/morpho-protocol-evm.js').MarketPosition} MarketPosition */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoProtocolOptions} MorphoProtocolOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').Presets} Presets */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoErc20SupplyOptions} MorphoErc20SupplyOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoNativeSupplyOptions} MorphoNativeSupplyOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoSupplyOptions} MorphoSupplyOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoBorrowOptions} MorphoBorrowOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').MorphoRepayOptions} MorphoRepayOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').RequirementOptions} RequirementOptions */
/** @typedef {import('./src/morpho-protocol-evm.js').ApprovalOrSignatureRequirement} ApprovalOrSignatureRequirement */
/** @typedef {import('./src/morpho-protocol-evm.js').RequirementApproval} RequirementApproval */
/** @typedef {import('./src/morpho-protocol-evm.js').RequirementAuthorization} RequirementAuthorization */
/** @typedef {import('./src/morpho-protocol-evm.js').RequirementSignatureRequest} RequirementSignatureRequest */
/** @typedef {import('./src/morpho-protocol-evm.js').RequirementSignature} RequirementSignature */
/** @typedef {import('./src/morpho-protocol-evm.js').VaultReallocation} VaultReallocation */
/** @typedef {import('./src/morpho-protocol-evm.js').Erc4337TransactionConfig} Erc4337TransactionConfig */

export { default } from './src/morpho-protocol-evm.js'

export {
  MORPHO_MARKET_PRESETS,
  MORPHO_VAULT_PRESETS
} from './src/morpho-presets.js'
