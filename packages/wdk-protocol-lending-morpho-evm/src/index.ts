export type { InputMarketParams } from "@morpho-org/blue-sdk";
export type {
  RequirementSignature,
  VaultReallocation,
} from "@morpho-org/morpho-sdk";
export type { TransactionResult } from "@tetherto/wdk-wallet";
export type {
  BorrowOptions,
  BorrowResult,
  RepayOptions,
  RepayResult,
  SupplyOptions,
  SupplyResult,
  WithdrawOptions,
  WithdrawResult,
} from "@tetherto/wdk-wallet/protocols";
export {
  type Market,
  type MarketPresetKey,
  MORPHO_MARKET_PRESETS,
  MORPHO_VAULT_PRESETS,
  type Vault,
  type VaultPresetKey,
} from "./morpho-presets.js";
export type {
  AccountData,
  ApprovalOrSignatureRequirement,
  Eip1193Provider,
  Erc4337TransactionConfig,
  MarketPosition,
  MorphoBorrowOptions,
  MorphoErc20SupplyOptions,
  MorphoEvmAccount,
  MorphoNativeSupplyOptions,
  MorphoProtocolOptions,
  MorphoRepayOptions,
  MorphoSupplyOptions,
  Presets,
  RequirementApproval,
  RequirementAuthorization,
  RequirementOptions,
  RequirementSignatureRequest,
  VaultPosition,
} from "./morpho-protocol-evm.js";
export {
  default,
  default as MorphoProtocolEvm,
} from "./morpho-protocol-evm.js";
