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
import { BlueSimulationErrors } from "@morpho-org/simulation-sdk";

export namespace MigratableBorrowPosition_Blue {
  /**
   * Arguments required to generate migration operations for a borrow position.
   */
  export interface Args {
    /** The market to migrate the position to. */
    marketTo: MarketId;

    /** The amount of collateral to migrate. */
    collateralassets: bigint;

    /** The amount to migrate. Must be `0n` if `borrowShares` is not `0n`.
     *
     * @default 0n
     */
    borrowAssets?: bigint;

    /** The number of shares to migrate. Must be `0n` if `borrowAssets` is not `0n`.
     *
     *  @default 0n
     */
    borrowShares?: bigint;

    /** Slippage tolerance for the current market (optional). */
    slippageFrom?: bigint;

    /** Slippage tolerance for the target market (optional). */
    slippageTo?: bigint;
  }
}

/**
 * Interface for a migratable borrow position on Morpho Blue.
 */
export interface IMigratableBorrowPosition_Blue {
  /** The market associated with the borrow position. */
  market: Market;

  /** Details of the borrow position, including shares, user, and collateral. */
  position: Pick<Position, "borrowShares" | "user" | "collateral">;
}

/**
 * Class representing a migratable borrow position on Morpho Blue.
 */
export class MigratableBorrowPosition_Blue
  implements IMigratableBorrowPosition_Blue
{
  public readonly market;
  public readonly position;

  /**
   * Creates a new instance of `MigratableBorrowPosition_Blue`.
   *
   * @param config - Configuration containing the market and position details.
   */
  constructor(config: IMigratableBorrowPosition_Blue) {
    this.market = config.market;
    this.position = config.position;
  }

  /**
   * Generates the migration operations required to migrate a borrow position
   * to a new market.
   *
   * @param args - Arguments containing migration details such as the target market,
   * collateral amount, borrow amount, and slippage tolerances.
   * @param chainId - The chain ID for the migration.
   *
   * @returns An operation object for bundling Blue migration calls.
   */
  public getMigrationOperations(
    {
      marketTo,
      collateralassets,
      borrowAssets = 0n,
      borrowShares = 0n,
      slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
      slippageTo = DEFAULT_SLIPPAGE_TOLERANCE,
    }: MigratableBorrowPosition_Blue.Args,
    chainId: ChainId,
  ): BlueInputBundlerOperations["Blue_SupplyCollateral"] {
    const { bundler } = getChainAddresses(chainId);

    const shouldMigrateBorrow = borrowAssets > 0n || borrowShares > 0n;

    if (collateralassets === 0n) throw new BlueSimulationErrors.ZeroAssets();

    if (borrowShares > 0n)
      borrowAssets = this.market.toBorrowAssets(borrowShares);

    return {
      type: "Blue_SupplyCollateral",
      address: "0x",
      sender: this.position.user,
      args: {
        id: marketTo,
        assets: collateralassets,
        onBehalf: this.position.user,
        callback: [
          ...(shouldMigrateBorrow
            ? ([
                {
                  type: "Blue_Borrow",
                  address: "0x",
                  sender: this.position.user,
                  args: {
                    id: marketTo,
                    assets:
                      borrowShares > 0n
                        ? MathLib.wMulUp(
                            borrowAssets,
                            MathLib.WAD + slippageFrom,
                          )
                        : borrowAssets,
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
                    ...(borrowShares === 0n
                      ? {
                          assets: borrowAssets,
                        }
                      : { shares: borrowShares }),
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
              assets: collateralassets,
              onBehalf: this.position.user,
              receiver: bundler,
            },
          },
        ],
      },
    };
  }
}
