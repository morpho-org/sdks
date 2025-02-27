import { MathLib, type Token } from "@morpho-org/blue-sdk";

import { maxUint256, parseUnits } from "viem";
import type { MigrationBundle } from "../../types/actions.js";
import { MigratableProtocol } from "../../types/index.js";
import {
  type IMigratableBorrowPosition,
  MigratableBorrowPosition,
} from "./index.js";

interface IMigratableBorrowPosition_AaveV3
  extends Omit<IMigratableBorrowPosition, "protocol"> {
  nonce: bigint;
  aToken: Token;
  collateralPriceEth: bigint;
  loanPriceEth: bigint;
}

export class MigratableBorrowPosition_AaveV3
  extends MigratableBorrowPosition
  implements IMigratableBorrowPosition_AaveV3
{
  private _nonce;
  public readonly aToken;
  public readonly collateralPriceEth;
  public readonly loanPriceEth;

  constructor(config: IMigratableBorrowPosition_AaveV3) {
    super({ ...config, protocol: MigratableProtocol.aaveV3 });
    this.aToken = config.aToken;
    this._nonce = config.nonce;
    this.collateralPriceEth = config.collateralPriceEth;
    this.loanPriceEth = config.loanPriceEth;
  }

  getLtv({
    withdrawn = 0n,
    repaid = 0n,
  }: { withdrawn?: bigint; repaid?: bigint } = {}): bigint | null {
    const totalCollateralEth =
      ((this.collateral - withdrawn) * this.collateralPriceEth) /
      parseUnits("1", this.collateralToken.decimals);

    const totalBorrowEth =
      ((this.borrow - repaid) * this.loanPriceEth) /
      parseUnits("1", this.loanToken.decimals);

    if (totalBorrowEth <= 0n) return null;
    if (totalCollateralEth <= 0n) return maxUint256;

    return MathLib.wDivUp(totalBorrowEth, totalCollateralEth);
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(): MigrationBundle {
    throw "not implemented"; // TODO
  }
}
