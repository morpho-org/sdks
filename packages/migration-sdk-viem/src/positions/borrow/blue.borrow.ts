import {
  type MarketId,
  type ChainId,
  type Market,
  type Position,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  MathLib,
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

export interface MigratableBorrowPositionConfig_Blue {
  chainId: ChainId;
  market: Market;
  position: Pick<Position, "borrowShares" | "user" | "collateral">;
}

export class MigratableBorrowPosition_Blue
  implements MigratableBorrowPositionConfig_Blue
{
  public readonly market: Market;
  public readonly position: Pick<
    Position,
    "borrowShares" | "user" | "collateral"
  >;
  public readonly chainId: ChainId;

  constructor(config: MigratableBorrowPositionConfig_Blue) {
    this.market = config.market;
    this.position = config.position;
    this.chainId = config.chainId;
  }

  public getMigrationOperations({
    marketTo,
    collateralAmount,
    borrowAmount,
    slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
    slippageTo = DEFAULT_SLIPPAGE_TOLERANCE,
  }: MigratableBorrowPosition_Blue.Args): BlueInputBundlerOperations["Blue_SupplyCollateral"] {
    const { bundler } = getChainAddresses(this.chainId);

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
