import { MathLib } from "../maths";
import { AccrualPosition } from "../position";

import { VaultMarketConfig } from "./VaultMarketConfig";

export interface InputVaultMarketAllocation {
  config: VaultMarketConfig;
  position: AccrualPosition;
}

export class VaultMarketAllocation implements InputVaultMarketAllocation {
  /**
   * The vault's configuration on the corresponding market.
   */
  public readonly config: VaultMarketConfig;

  /**
   * The vault's position on the corresponding market.
   */
  public readonly position: AccrualPosition;

  constructor({ config, position }: InputVaultMarketAllocation) {
    this.config = config;
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
