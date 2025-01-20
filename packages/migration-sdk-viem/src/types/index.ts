export * from "./actions.js";
export * from "./positions.js";

export enum MigratableProtocol {
  aaveV3Optimizer = "aaveV3Optimizer",
  aaveV2 = "aaveV2",
  aaveV3 = "aaveV3",
  compoundV3 = "compoundV3",
  /**
   * - `Compound V2` on _Ethereum Mainnet_
   * - `Moonwell` on _Base Mainnet_
   */
  compoundV2 = "compoundV2", // moonwell on base
}
