import type { Address } from "viem";

import { VaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2MorphoVaultV1Adapter extends IVaultV2Adapter {
  morphoVaultV1: Address;
}

import type { BigIntish } from "../types";
import type { AccrualVault } from "../vault";
import type { IAccrualVaultV2Adapter, IVaultV2Adapter } from "./VaultV2Adapter";

export class VaultV2MorphoVaultV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoVaultV1Adapter
{
  public readonly morphoVaultV1: Address;

  constructor({
    morphoVaultV1,
    ...vaultV2Adapter
  }: IVaultV2MorphoVaultV1Adapter) {
    super(vaultV2Adapter);
    this.morphoVaultV1 = morphoVaultV1;
  }

  public ids() {
    return [this.adapterId];
  }
}

export interface IAccrualVaultV2MorphoVaultV1Adapter
  extends IVaultV2MorphoVaultV1Adapter {}

export class AccrualVaultV2MorphoVaultV1Adapter
  extends VaultV2MorphoVaultV1Adapter
  implements IAccrualVaultV2MorphoVaultV1Adapter, IAccrualVaultV2Adapter
{
  constructor(
    adapter: IAccrualVaultV2MorphoVaultV1Adapter,
    public vaultV1: AccrualVault,
    public shares: bigint,
  ) {
    super(adapter);
  }

  realAssets(timestamp: BigIntish) {
    return this.vaultV1.accrueInterest(timestamp).toAssets(this.shares);
  }
}
