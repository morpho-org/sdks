import {
  type ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type Market,
  type MarketId,
  MathLib,
  type Position,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { BlueInputBundlerOperations } from "@morpho-org/bundler-sdk-viem";
import { maxUint256 } from "viem";

export namespace MigratableBorrowPosition_Blue {
  export interface Args {
    marketTo: MarketId;
    collateralAmount: bigint;
    borrowAmount: bigint;
    slippageFrom?: bigint;
    slippageTo?: bigint;
  }
}

export interface IMigratableBorrowPosition_Blue {
  market: Market;
  position: Pick<Position, "borrowShares" | "user" | "collateral">;
}

export class MigratableBorrowPosition_Blue
  implements IMigratableBorrowPosition_Blue
{
  public readonly market;
  public readonly position;

  constructor(config: IMigratableBorrowPosition_Blue) {
    this.market = config.market;
    this.position = config.position;
  }

  public getMigrationOperations(
    {
      marketTo,
      collateralAmount,
      borrowAmount,
      slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
      slippageTo = DEFAULT_SLIPPAGE_TOLERANCE,
    }: MigratableBorrowPosition_Blue.Args,
    chainId: ChainId,
  ): BlueInputBundlerOperations["Blue_SupplyCollateral"] {
    const { bundler } = getChainAddresses(chainId);

    return {
      type: "Blue_SupplyCollateral",
      address: "0x",
      sender: this.position.user,
      args: {
        id: marketTo,
        assets:
          collateralAmount === maxUint256
            ? this.position.collateral
            : collateralAmount,
        onBehalf: this.position.user,
        callback: [
          ...(borrowAmount > 0n
            ? ([
                {
                  type: "Blue_Borrow",
                  address: "0x",
                  sender: this.position.user,
                  args: {
                    id: marketTo,
                    assets:
                      borrowAmount === maxUint256
                        ? MathLib.wMulUp(
                            this.market.toBorrowAssets(
                              this.position.borrowShares,
                            ),
                            MathLib.WAD + slippageFrom,
                          )
                        : borrowAmount,
                    receiver: bundler,
                    onBehalf: this.position.user,
                    slippage: slippageTo,
                  },
                },
                {
                  type: "Blue_Repay",
                  address: "0x",
                  sender: this.position.user,
                  args: {
                    id: this.market.id,
                    slippage: slippageFrom,
                    ...(borrowAmount !== maxUint256
                      ? {
                          assets: borrowAmount,
                        }
                      : { shares: this.position.borrowShares }),
                    onBehalf: this.position.user,
                  },
                },
              ] as const)
            : []),
          {
            type: "Blue_WithdrawCollateral",
            address: "0x",
            sender: this.position.user,
            args: {
              id: this.market.id,
              assets:
                collateralAmount === maxUint256
                  ? this.position.collateral
                  : collateralAmount,
              onBehalf: this.position.user,
              receiver: bundler,
            },
          },
        ],
      },
    };
  }
}
