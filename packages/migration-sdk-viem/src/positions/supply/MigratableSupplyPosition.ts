import type { Address, ChainId } from "@morpho-org/blue-sdk";

import type { MigrationBundle } from "../../types/actions.js";
import type {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

/**
 * Namespace containing argument definitions for Migratable Supply Position.
 */
export namespace MigratableSupplyPosition {
  /**
   * Arguments required for building a migration operation.
   */
  export interface Args {
    /** The amount to migrate. */
    amount: bigint;
    /** The maximum vault share price expected (scaled by RAY). */
    maxSharePrice: bigint;
    /** The address of the vault to migrate to. */
    vault: Address;
  }
}

/**
 * Interface representing the structure of a migratable supply position.
 */
export interface IMigratableSupplyPosition {
  /** The chain ID where the position resides. */
  chainId: ChainId;
  /** The protocol associated with the supply position. */
  protocol: MigratableProtocol;
  /** The user's address. */
  user: Address;
  /** The address of the loan token being supplied. */
  loanToken: Address;
  /** The total supply balance of the position. */
  supply: bigint;
  /** The annual percentage yield (APY) of the supply position. */
  supplyApy: number;
  /** The maximum supply migration limit and its corresponding limiter. */
  max: { value: bigint; limiter: SupplyMigrationLimiter };
}

/**
 * Abstract class representing a migratable supply position.
 */
export abstract class MigratableSupplyPosition
  implements IMigratableSupplyPosition
{
  public readonly protocol;
  public readonly user;
  public readonly loanToken;
  public readonly supply;
  public readonly supplyApy;
  public readonly max;
  public readonly chainId;

  /**
   * Creates an instance of MigratableSupplyPosition.
   *
   * @param config - Configuration object containing the position details.
   */
  constructor(config: IMigratableSupplyPosition) {
    this.protocol = config.protocol;
    this.user = config.user;
    this.loanToken = config.loanToken;
    this.supply = config.supply;
    this.supplyApy = config.supplyApy;
    this.max = config.max;
    this.chainId = config.chainId;
  }

  /**
   * Method to retrieve a migration operation for the supply position.
   *
   * @param args - The arguments required to execute the migration.
   * @param chainId - The chain ID of the migration.
   * @param supportsSignature - Whether the migration supports signature-based execution.
   *
   * @returns A migration bundle containing the migration details.
   */
  abstract getMigrationTx(
    args: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature: boolean,
  ): MigrationBundle;
}
