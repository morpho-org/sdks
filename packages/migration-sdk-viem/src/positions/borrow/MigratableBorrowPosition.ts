import type { Address, ChainId, MarketId, Token } from "@morpho-org/blue-sdk";

import type { MigrationBundle } from "../../types/actions.js";
import type {
  BorrowMigrationLimiter,
  MigratableProtocol,
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
    /** The id of the market to migrate to. */
    marketTo: MarketId;
    /** Slippage tolerance for the current position (optional). */
    slippageFrom?: bigint;
    /** Slippage tolerance for the target market (optional). */
    slippageTo?: bigint;
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
  }

  abstract getLtv(options?: { withdrawn?: bigint; repaid?: bigint }):
    | bigint
    | null;

  /**
   * Method to retrieve a migration operation for the borrow position.
   *
   * @param args - The arguments required to execute the migration.
   * @param chainId - The chain ID of the migration.
   * @param supportsSignature - Whether the migration supports signature-based execution.
   *
   * @returns A migration bundle containing the migration details.
   */
  abstract getMigrationTx(
    args: MigratableBorrowPosition.Args,
    chainId: ChainId,
    supportsSignature: boolean,
  ): MigrationBundle;
}
