import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";

import { VaultV2Adapter } from "./VaultV2Adapter.js";

/** Plain input shape for a Vault V2 adapter investing in a MetaMorpho V1 vault. */
export interface IVaultV2MorphoVaultV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  type?: "VaultV2MorphoVaultV1Adapter";
  morphoVaultV1: Address;
  /**
   * Parent Vault V2 allocation for this adapter, when available.
   *
   * TODO(vNext-major): make `parentAllocation` required.
   */
  readonly parentAllocation?: bigint;
}

import type { BigIntish, Hash } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
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
   * import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
   *
   * const adapterAddress = "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";
   * const id = VaultV2MorphoVaultV1Adapter.adapterCapId(adapterAddress);
   * // id satisfies Hash
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
   * @example
   * ```ts
   * import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
   *
   * const adapterAddress = "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";
   * const id = VaultV2MorphoVaultV1Adapter.adapterId(adapterAddress);
   * // id satisfies Hash
   * ```
   */
  static adapterId(address: Address) {
    return VaultV2MorphoVaultV1Adapter.adapterCapId(address);
  }

  public readonly morphoVaultV1: Address;
  /**
   * Parent Vault V2 allocation for this adapter, when available.
   *
   * TODO(vNext-major): make `parentAllocation` required.
   */
  public readonly parentAllocation?: bigint;

  constructor({
    morphoVaultV1,
    parentAllocation,
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
    this.parentAllocation = parentAllocation;
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
    /** @deprecated Set `adapter.parentAllocation` instead. This parameter will be removed in the next major. */
    parentAllocation: bigint | undefined = adapter.parentAllocation,
  ) {
    super({ ...adapter, parentAllocation });
  }

  /**
   * Returns underlying assets represented by the adapter's Vault V1 shares at a timestamp.
   *
   * Projects nested market interest and Vault V1 fees. Returns zero without projecting the nested
   * vault when the parent Vault V2 tracks no allocation for this adapter, even if the adapter holds
   * Vault V1 shares transferred directly to it. An undefined `parentAllocation` preserves legacy
   * share-based accounting.
   *
   * @param timestamp - Optional accrual timestamp. Defaults each nested market to its own
   *   `lastUpdate`.
   * @returns The projected underlying assets represented by `shares`, or `0n` when
   *   `parentAllocation` is `0n`.
   * @throws {UnknownMarketAllocationError} when the nested Vault V1 withdraw queue references a
   *   market without an allocation.
   * @throws {BlueErrors.InvalidInterestAccrual} when `timestamp` precedes a nested market's
   *   `lastUpdate`.
   * @example
   * ```ts
   * import { AccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
   * import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const fetched = await fetchAccrualVaultV2MorphoVaultV1Adapter(
   *   "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
   *   client,
   * );
   * const residual = new AccrualVaultV2MorphoVaultV1Adapter(
   *   { ...fetched, parentAllocation: 0n },
   *   fetched.accrualVaultV1,
   *   1n,
   * );
   * const assets = residual.realAssets();
   * // assets === 0n
   * ```
   */
  realAssets(timestamp?: BigIntish) {
    if (this.parentAllocation === 0n) return 0n;
    return this.accrualVaultV1.accrueInterest(timestamp).toAssets(this.shares);
  }

  /**
   * Returns this adapter's capacity to deposit into its Vault V1 vault.
   *
   * Delegates to the nested vault's supply-queue caps. Adapter routing data and
   * `parentAllocation` do not affect this calculation.
   *
   * @param _data - Adapter-specific data; ignored by this adapter.
   * @param assets - Maximum underlying assets to deposit.
   * @returns A capacity limit containing the depositable asset amount and either the `cap` or
   *   `balance` limiting reason.
   * @example
   * ```ts
   * import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const adapter = await fetchAccrualVaultV2MorphoVaultV1Adapter(
   *   "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
   *   client,
   * );
   * const limit = adapter.maxDeposit("0x", 1_000_000n);
   * // limit satisfies CapacityLimit
   * ```
   */
  maxDeposit(_data: Hex, assets: BigIntish) {
    return this.accrualVaultV1.maxDeposit(assets);
  }

  /**
   * Returns underlying assets currently withdrawable through this adapter.
   *
   * Returns a position-limited zero capacity when the parent Vault V2 tracks no allocation for
   * this adapter, even if the adapter holds Vault V1 shares transferred directly to it. An
   * undefined `parentAllocation` preserves legacy share-based accounting. Otherwise, the nested
   * vault applies share conversion and liquidity limiting.
   *
   * @param _data - Adapter-specific data; ignored by this adapter.
   * @returns A capacity limit using `position` for zero parent allocation, or the nested vault's
   *   `balance` or `liquidity` limiting reason otherwise.
   * @example
   * ```ts
   * import { AccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
   * import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const fetched = await fetchAccrualVaultV2MorphoVaultV1Adapter(
   *   "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
   *   client,
   * );
   * const residual = new AccrualVaultV2MorphoVaultV1Adapter(
   *   { ...fetched, parentAllocation: 0n },
   *   fetched.accrualVaultV1,
   *   1n,
   * );
   * const limit = residual.maxWithdraw("0x");
   * // limit equals { value: 0n, limiter: CapacityLimitReason.position }
   * ```
   */
  maxWithdraw(_data: Hex) {
    // Vault V2 rejects deallocation when its tracked adapter allocation is zero,
    // even if the adapter holds residual Vault V1 shares from direct transfers.
    if (this.parentAllocation === 0n)
      return { value: 0n, limiter: CapacityLimitReason.position };
    return this.accrualVaultV1.maxWithdraw(this.shares);
  }
}
