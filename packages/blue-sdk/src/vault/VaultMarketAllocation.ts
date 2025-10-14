import { MathLib } from "../math/index.js";
import type { AccrualPosition } from "../position/index.js";

import {
  type IVaultMarketConfig,
  VaultMarketConfig,
} from "./VaultMarketConfig.js";

export interface IVaultMarketAllocation {
  config: IVaultMarketConfig;
  position: AccrualPosition;
}

export class VaultMarketAllocation implements IVaultMarketAllocation {
  /**
   * The vault's configuration on the corresponding market.
   */
  public readonly config: VaultMarketConfig;

  /**
   * The vault's position on the corresponding market.
   */
  public readonly position: AccrualPosition;

  constructor({ config, position }: IVaultMarketAllocation) {
    this.config = new VaultMarketConfig(config);
    this.position = position;
  }

  get vault() {
    return this.config.vault;
  }

  get marketId() {
    return this.config.marketId;
  }

  get utilization() {
    if (this.config.cap === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivDown(this.position.supplyAssets, this.config.cap);
  }
}
