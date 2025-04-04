import type {
  Address,
  ChainId,
  MarketParams,
  Token,
} from "@morpho-org/blue-sdk";

import type { ActionBundle } from "@morpho-org/bundler-sdk-viem";
import type {
  BorrowMigrationLimiter,
  MigratableProtocol,
  MigrationTransactionRequirement,
  SupplyMigrationLimiter,
} from "../../types/index.js";

/**
 * Namespace containing argument definitions for Migratable Borrow Position.
 */
export namespace MigratableBorrowPosition {
  /**
   * Arguments required for building a migration operation.
   */
  export interface Args {
    /** The collateral amount to migrate. */
    collateralAmount: bigint;
    /** The borrow amount to migrate. */
    borrowAmount: bigint;
    /** The market to migrate to. */
    marketTo: MarketParams;
    /** Slippage tolerance for the current position (optional). */
    slippageFrom?: bigint;
    /** The maximum amount of borrow shares mint (protects the sender from unexpected slippage). */
    minSharePrice: bigint;
  }
}

/**
 * Interface representing the structure of a migratable borrow position.
 */
export interface IMigratableBorrowPosition {
  /** The chain ID where the position resides. */
  chainId: ChainId;
  /** The protocol associated with the borrow position. */
  protocol: MigratableProtocol;
  /** The user's address. */
  user: Address;
  /** The token being used as collateral. */
  collateralToken: Token;
  /** The loan token being borrowed. */
  loanToken: Token;
  /** The total collateral balance of the position. */
  collateral: bigint;
  /** The total borrow balance of the position. */
  borrow: bigint;
  /** The annual percentage yield (APY) of the collateral position. */
  collateralApy: number;
  /** The annual percentage yield (APY) of the borrow position. */
  borrowApy: number;
  /** The maximum collateral migration limit and its corresponding limiter. */
  maxWithdraw: { value: bigint; limiter: SupplyMigrationLimiter };
  /** The maximum borrow migration limit and its corresponding limiter. */
  maxRepay: { value: bigint; limiter: BorrowMigrationLimiter };
  /** The liquidation loan to value (LLTV) of the market */
  lltv: bigint;
  /** Whether the migration adapter is authorized to manage user's position on blue */
  isBundlerManaging: boolean;
  /** User nonce on morpho contract */
  morphoNonce: bigint;
}

/**
 * Abstract class representing a migratable borrow position.
 */
export abstract class MigratableBorrowPosition
  implements IMigratableBorrowPosition
{
  public readonly protocol;
  public readonly user;
  public readonly loanToken;
  public readonly borrow;
  public readonly borrowApy;
  public readonly chainId;
  public readonly collateralToken;
  public readonly collateral;
  public readonly collateralApy;
  public readonly maxRepay;
  public readonly maxWithdraw;
  public readonly lltv;
  public readonly isBundlerManaging;
  public readonly morphoNonce;

  /**
   * Creates an instance of MigratableBorrowPosition.
   *
   * @param config - Configuration object containing the position details.
   */
  constructor(config: IMigratableBorrowPosition) {
    this.protocol = config.protocol;
    this.user = config.user;
    this.loanToken = config.loanToken;
    this.borrow = config.borrow;
    this.borrowApy = config.borrowApy;
    this.maxWithdraw = config.maxWithdraw;
    this.chainId = config.chainId;
    this.collateralToken = config.collateralToken;
    this.collateral = config.collateral;
    this.collateralApy = config.collateralApy;
    this.maxRepay = config.maxRepay;
    this.lltv = config.lltv;
    this.isBundlerManaging = config.isBundlerManaging;
    this.morphoNonce = config.morphoNonce;
  }

  abstract getLtv(options?: { withdrawn?: bigint; repaid?: bigint }):
    | bigint
    | null;

  protected abstract _getMigrationTx(
    args: MigratableBorrowPosition.Args,
    supportsSignature: boolean,
  ): ActionBundle<MigrationTransactionRequirement>;

  /**
   * Method to retrieve a migration operation for the borrow position.
   *
   * @param args - The arguments required to execute the migration.
   * @param chainId - The chain ID of the migration.
   * @param supportsSignature - Whether the migration supports signature-based execution.
   *
   * @returns A migration bundle containing the migration details.
   */
  getMigrationTx(
    args: MigratableBorrowPosition.Args,
    supportsSignature: boolean,
  ) {
    this._validateMigration(args);

    return this._getMigrationTx(args, supportsSignature);
  }

  private _validateMigration({
    marketTo,
    borrowAmount,
    collateralAmount,
  }: Pick<
    MigratableBorrowPosition.Args,
    "marketTo" | "borrowAmount" | "collateralAmount"
  >) {
    if (
      marketTo.collateralToken !== this.collateralToken.address ||
      marketTo.loanToken !== this.loanToken.address
    )
      throw new Error("Invalid market");

    if (borrowAmount > this.maxRepay.value)
      throw new Error(
        `Max borrow migration limited by: ${this.maxRepay.limiter}`,
      );
    if (collateralAmount > this.maxWithdraw.value)
      throw new Error(
        `Max collateral migration limited by: ${this.maxWithdraw.limiter}`,
      );
  }
}
