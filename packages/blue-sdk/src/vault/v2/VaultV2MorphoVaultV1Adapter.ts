import { type Address, type Hex, encodeAbiParameters, keccak256 } from "viem";
import { MathLib } from "../../math/index.js";

import { VaultV2Adapter } from "./VaultV2Adapter.js";

export interface IVaultV2MorphoVaultV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId"> {
  morphoVaultV1: Address;
}

import type { BigIntish, MarketId } from "../../types.js";
import type { AccrualVault } from "../Vault.js";
import type {
  AdapterDeallocatableResult,
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
  MarketDeallocatableData,
} from "./VaultV2Adapter.js";

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

  maxDeallocatableAssets(): Map<MarketId, MarketDeallocatableData> {
    const result = new Map<MarketId, MarketDeallocatableData>();
    let remaining = this.realAssets();
    if (remaining === 0n) return result;

    for (const marketId of this.accrualVaultV1.withdrawQueue) {
      const allocation = this.accrualVaultV1.allocations.get(marketId);
      if (!allocation) continue;

      const vaultSupply = allocation.position.supplyAssets;
      const { liquidity } = allocation.position.market;
      const supplyAssets = MathLib.min(vaultSupply, liquidity, remaining);

      result.set(marketId, { supplyAssets, liquidity });
      remaining -= supplyAssets;
      if (remaining === 0n) break;
    }
    return result;
  }

  /**
   * Simulates the MetaMorpho V1 withdraw queue to compute actual per-market
   * consumption given remaining liquidity across markets.
   */
  computeActualDeallocatable(
    remainingLiquidity: ReadonlyMap<MarketId, bigint>,
  ): AdapterDeallocatableResult {
    const consumed = new Map<MarketId, bigint>();
    let total = 0n;
    let remaining = this.realAssets();
    if (remaining === 0n) return { consumed, total };

    for (const marketId of this.accrualVaultV1.withdrawQueue) {
      const allocation = this.accrualVaultV1.allocations.get(marketId);
      if (!allocation) continue;

      const vaultSupply = allocation.position.supplyAssets;
      const mktLiquidity = remainingLiquidity.get(marketId) ?? 0n;
      const c = MathLib.min(vaultSupply, mktLiquidity, remaining);
      consumed.set(marketId, c);
      total += c;
      remaining -= c;
      if (remaining === 0n) break;
    }

    return { consumed, total };
  }
}
