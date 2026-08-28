import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";

import { VaultV2Adapter } from "./VaultV2Adapter.js";

/** Plain input shape for a Vault V2 adapter investing in a MetaMorpho V1 vault. */
export interface IVaultV2MorphoVaultV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  type?: "VaultV2MorphoVaultV1Adapter";
  morphoVaultV1: Address;
}

import type { BigIntish, Hash } from "../../types.js";
import type { AccrualVault } from "../Vault.js";
import type {
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
} from "./VaultV2Adapter.js";

/** Represents a Vault V2 adapter investing in a MetaMorpho V1 vault. */
export class VaultV2MorphoVaultV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoVaultV1Adapter
{
  public declare readonly type: "VaultV2MorphoVaultV1Adapter";

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoVaultV1Adapter.adapterCapId(adapter);
   * ```
   */
  static adapterCapId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", address],
      ),
    );
  }

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @deprecated Use {@link VaultV2MorphoVaultV1Adapter.adapterCapId}.
   */
  static adapterId(address: Address) {
    return VaultV2MorphoVaultV1Adapter.adapterCapId(address);
  }

  public readonly morphoVaultV1: Address;

  constructor({
    morphoVaultV1,
    ...vaultV2Adapter
  }: IVaultV2MorphoVaultV1Adapter) {
    super({
      ...vaultV2Adapter,
      type: "VaultV2MorphoVaultV1Adapter",
      adapterId: VaultV2MorphoVaultV1Adapter.adapterCapId(
        vaultV2Adapter.address,
      ),
    });

    this.morphoVaultV1 = morphoVaultV1;
  }

  /**
   * Returns this adapter's allocation-cap ids.
   *
   * @returns A readonly tuple containing the adapter-wide allocation-cap id.
   * @example
   * ```ts
   * import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
   * import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
   *
   * const adapter = new VaultV2MorphoVaultV1Adapter({
   *   address: ZERO_ADDRESS,
   *   parentVault: ZERO_ADDRESS,
   *   skimRecipient: ZERO_ADDRESS,
   *   morphoVaultV1: ZERO_ADDRESS,
   * });
   * const [adapterCapId] = adapter.ids();
   * ```
   */
  public ids(): readonly [adapterCapId: Hash] {
    return [this.adapterId];
  }
}

/** Plain input shape for an accrued Vault V2 MetaMorpho V1 adapter. */
export interface IAccrualVaultV2MorphoVaultV1Adapter
  extends IVaultV2MorphoVaultV1Adapter {}

/** Represents an accrued Vault V2 MetaMorpho V1 adapter. */
export class AccrualVaultV2MorphoVaultV1Adapter
  extends VaultV2MorphoVaultV1Adapter
  implements IAccrualVaultV2MorphoVaultV1Adapter, IAccrualVaultV2Adapter
{
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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

  /**
   * Returns a new adapter whose underlying MetaMorpho V1 vault (and its market
   * positions) has been accrued up to the given timestamp.
   * @param timestamp The timestamp at which to accrue interest. Must be greater
   * than or equal to each underlying market's `lastUpdate`.
   * @returns A new `AccrualVaultV2MorphoVaultV1Adapter` wrapping the V1 vault
   * accrued to `timestamp`.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes an
   * underlying market's `lastUpdate`.
   * @example
   * ```ts
   * const accrued = adapter.accrueInterest(timestamp);
   * // accrued.realAssets(timestamp) reflects the V1 vault's assets at `timestamp`
   * ```
   */
  accrueInterest(timestamp: BigIntish) {
    return new AccrualVaultV2MorphoVaultV1Adapter(
      this,
      this.accrualVaultV1.accrueInterest(timestamp),
      this.shares,
    );
  }

  maxDeposit(_data: Hex, assets: BigIntish) {
    return this.accrualVaultV1.maxDeposit(assets);
  }

  maxWithdraw(_data: Hex) {
    return this.accrualVaultV1.maxWithdraw(this.shares);
  }
}
