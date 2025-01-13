import type { Address, ChainId } from "@morpho-org/blue-sdk";

import type { MigrationBundle } from "../../types/actions.js";
import type {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

export namespace MigratableSupplyPosition {
  export interface Args {
    amount: bigint;
    minShares: bigint;
    vault: Address;
  }
}

export interface MigratableSupplyPositionConfig {
  chainId: ChainId;
  protocol: MigratableProtocol;
  user: Address;
  loanToken: Address;
  supply: bigint;
  supplyApy: number;
  max: { value: bigint; limiter: SupplyMigrationLimiter };
}

export abstract class MigratableSupplyPosition
  implements MigratableSupplyPositionConfig
{
  public readonly protocol: MigratableProtocol;
  public readonly user: Address;
  public readonly loanToken: Address;
  public readonly supply: bigint;
  public readonly supplyApy: number;
  public readonly max: { value: bigint; limiter: SupplyMigrationLimiter };
  public readonly chainId: ChainId;

  constructor(config: MigratableSupplyPositionConfig) {
    this.protocol = config.protocol;
    this.user = config.user;
    this.loanToken = config.loanToken;
    this.supply = config.supply;
    this.supplyApy = config.supplyApy;
    this.max = config.max;
    this.chainId = config.chainId;
  }

  abstract getMigrationTx(
    args: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature: boolean,
  ): MigrationBundle;
}
