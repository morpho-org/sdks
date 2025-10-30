import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";

import { VaultV2Adapter } from "./VaultV2Adapter";

export interface IVaultV2MorphoVaultV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId"> {
  morphoVaultV1: Address;
}

import type { BigIntish } from "../../types";
import type { AccrualVault } from "../Vault";
import type { IAccrualVaultV2Adapter, IVaultV2Adapter } from "./VaultV2Adapter";

export class VaultV2MorphoVaultV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoVaultV1Adapter
{
  static adapterId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", address],
      ),
    );
  }

  public readonly morphoVaultV1: Address;

  constructor({
    morphoVaultV1,
    ...vaultV2Adapter
  }: IVaultV2MorphoVaultV1Adapter) {
    super({
      ...vaultV2Adapter,
      adapterId: VaultV2MorphoVaultV1Adapter.adapterId(vaultV2Adapter.address),
    });

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
    public accrualVaultV1: AccrualVault,
    public shares: bigint,
  ) {
    super(adapter);
  }

  realAssets(timestamp?: BigIntish) {
    return this.accrualVaultV1.accrueInterest(timestamp).toAssets(this.shares);
  }

  maxDeposit(_data: Hex, assets: BigIntish) {
    return this.accrualVaultV1.maxDeposit(assets);
  }

  maxWithdraw(_data: Hex) {
    return this.accrualVaultV1.maxWithdraw(this.shares);
  }
}
