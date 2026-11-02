import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";
import {
  type IMarketParams,
  MarketParams,
  marketParamsAbi,
} from "../../market/index.js";
import { MathLib } from "../../math/MathLib.js";
import type { AccrualPosition } from "../../position/index.js";
import type { BigIntish, Hash } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
import type { IVaultV2Allocation } from "./VaultV2.js";
import type {
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { VaultV2Adapter } from "./VaultV2Adapter.js";

/** Plain input shape for a Vault V2 adapter investing in Morpho Blue markets. */
export interface IVaultV2MorphoMarketV1Adapter
  extends Omit<IVaultV2Adapter, "adapterId" | "type"> {
  type?: "VaultV2MorphoMarketV1Adapter";
  marketParamsList: IMarketParams[];
}

/** Represents a Vault V2 adapter investing in Morpho Blue markets. */
export class VaultV2MorphoMarketV1Adapter
  extends VaultV2Adapter
  implements IVaultV2MorphoMarketV1Adapter
{
  public declare readonly type: "VaultV2MorphoMarketV1Adapter";

  /**
   * Returns the adapter-wide allocation-cap id.
   *
   * @param address - Adapter address.
   * @returns The adapter-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.adapterCapId(adapter);
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
   * Returns the collateral-wide allocation-cap id.
   *
   * @param address - Collateral token address.
   * @returns The collateral-wide allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.collateralCapId(collateral);
   * ```
   */
  static collateralCapId(address: Address) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", address],
      ),
    );
  }

  /**
   * Returns the adapter-market allocation-cap id.
   *
   * @param address - Adapter address.
   * @param params - Morpho Blue market parameters.
   * @returns The adapter-market allocation-cap id.
   * @example
   * ```ts
   * const id = VaultV2MorphoMarketV1Adapter.adapterMarketCapId(
   *   adapter,
   *   marketParams,
   * );
   * ```
   */
  static adapterMarketCapId(address: Address, params: MarketParams) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", address, params],
      ),
    );
  }

  public marketParamsList: MarketParams[];

  constructor({
    marketParamsList,
    ...vaultV2Adapter
  }: IVaultV2MorphoMarketV1Adapter) {
    super({
      ...vaultV2Adapter,
      type: "VaultV2MorphoMarketV1Adapter",
      adapterId: VaultV2MorphoMarketV1Adapter.adapterCapId(
        vaultV2Adapter.address,
      ),
    });

    this.marketParamsList = marketParamsList.map(
      (params) => new MarketParams(params),
    );
  }

  /**
   * Returns this adapter's allocation-cap ids for a Morpho Blue market.
   *
   * @param params - Morpho Blue market parameters.
   * @returns A readonly tuple containing the adapter, collateral, and adapter-market
   *   allocation-cap ids, in that order.
   * @example
   * ```ts
   * import {
   *   MarketParams,
   *   VaultV2MorphoMarketV1Adapter,
   * } from "@morpho-org/blue-sdk";
   * import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
   *
   * const marketParams = MarketParams.idle(ZERO_ADDRESS);
   * const adapter = new VaultV2MorphoMarketV1Adapter({
   *   address: ZERO_ADDRESS,
   *   parentVault: ZERO_ADDRESS,
   *   skimRecipient: ZERO_ADDRESS,
   *   marketParamsList: [marketParams],
   * });
   * const [adapterCapId, collateralCapId, adapterMarketCapId] =
   *   adapter.ids(marketParams);
   * ```
   */
  public ids(
    params: MarketParams,
  ): readonly [
    adapterCapId: Hash,
    collateralCapId: Hash,
    adapterMarketCapId: Hash,
  ] {
    return [
      this.adapterId,
      VaultV2MorphoMarketV1Adapter.collateralCapId(params.collateralToken),
      VaultV2MorphoMarketV1Adapter.adapterMarketCapId(this.address, params),
    ];
  }
}

/** Plain input shape for an accrued Morpho Blue market Vault V2 adapter. */
export interface IAccrualVaultV2MorphoMarketV1Adapter
  extends IVaultV2MorphoMarketV1Adapter {}

/** Represents an accrued Morpho Blue market Vault V2 adapter. */
export class AccrualVaultV2MorphoMarketV1Adapter
  extends VaultV2MorphoMarketV1Adapter
  implements IAccrualVaultV2MorphoMarketV1Adapter, IAccrualVaultV2Adapter
{
  constructor(
    adapter: IAccrualVaultV2MorphoMarketV1Adapter,
    public positions: AccrualPosition[],
  ) {
    super(adapter);
  }

  /** {@inheritDoc IAccrualVaultV2Adapter.realAssets} */
  realAssets(timestamp?: BigIntish) {
    return this.positions.reduce(
      (total, position) =>
        position.supplyShares === 0n
          ? total
          : total + position.accrueInterest(timestamp).supplyAssets,
      0n,
    );
  }

  /**
   * Returns a new adapter whose underlying positions (and their markets) have
   * been accrued up to the given timestamp.
   * Past timestamps and markets already ahead of `timestamp` keep their snapshots
   * without throwing. Zero-share positions are left unchanged.
   * @param timestamp The timestamp at which to accrue interest.
   * @returns A new `AccrualVaultV2MorphoMarketV1Adapter` with contributing
   * positions accrued to `timestamp`.
   * @throws {UnsupportedMarketIrmError} when forward projection of a market with
   * positive debt requires an unsupported IRM.
   * @example
   * ```ts
   * import {
   *   AccrualPosition,
   *   AccrualVaultV2MorphoMarketV1Adapter,
   *   MarketParams,
   * } from "@morpho-org/blue-sdk";
   * import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
   *
   * const marketParams = MarketParams.idle(ZERO_ADDRESS);
   * const position = new AccrualPosition(
   *   { user: ZERO_ADDRESS, supplyShares: 0n, borrowShares: 0n, collateral: 0n },
   *   {
   *     params: marketParams,
   *     totalSupplyAssets: 0n,
   *     totalBorrowAssets: 0n,
   *     totalSupplyShares: 0n,
   *     totalBorrowShares: 0n,
   *     lastUpdate: 1_700_000_000n,
   *     fee: 0n,
   *   },
   * );
   * const adapter = new AccrualVaultV2MorphoMarketV1Adapter(
   *   {
   *     address: ZERO_ADDRESS,
   *     parentVault: ZERO_ADDRESS,
   *     skimRecipient: ZERO_ADDRESS,
   *     marketParamsList: [marketParams],
   *   },
   *   [position],
   * );
   * const accrued = adapter.accrueInterest(position.market.lastUpdate);
   * // accrued.positions[0]!.market.lastUpdate === position.market.lastUpdate
   * ```
   */
  accrueInterest(timestamp: BigIntish) {
    return new AccrualVaultV2MorphoMarketV1Adapter(
      this,
      this.positions.map((position) =>
        position.supplyShares === 0n
          ? position
          : position.accrueInterest(timestamp),
      ),
    );
  }

  maxDeposit(_data: Hex, assets: BigIntish) {
    return {
      value: BigInt(assets),
      limiter: CapacityLimitReason.balance,
    };
  }

  /**
   * Returns unbooked supply interest for the routed market at its accrued state.
   * For deposit quotes, accrue to the expected inclusion time plus a caller-chosen delay
   * margin; the current block's state omits interest earned before inclusion.
   * @param data - Encoded market parameters.
   * @param allocations - Recorded liquidity allocations.
   * @returns Nonnegative pending increase, or zero when the cap allocation or routed position
   *   is absent, or the position is not above the recorded allocation.
   * @throws {InvalidMarketParamsError} When the routing data cannot be decoded as market parameters.
   * @example
   * ```ts
   * import {
   *   AccrualPosition, AccrualVaultV2MorphoMarketV1Adapter,
   *   MarketParams, marketParamsAbi, VaultV2MorphoMarketV1Adapter,
   * } from "@morpho-org/blue-sdk";
   * import { createPublicClient, encodeAbiParameters, http, zeroAddress } from "viem";
   * import { base } from "viem/chains";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const { timestamp } = await client.getBlock();
   * // Illustrative delays; choose both for the chain and transaction submission path.
   * const expectedInclusionTimestamp = timestamp + 30n;
   * const inclusionMargin = 30n;
   * // Illustrative snapshot; use real adapter and vault allocation data in practice.
   * const adapterAddress = zeroAddress;
   * const marketParams = MarketParams.idle(zeroAddress);
   * const position = new AccrualPosition(
   *   { user: adapterAddress, supplyShares: 500_000_000n, borrowShares: 0n, collateral: 0n },
   *   { params: marketParams, totalSupplyAssets: 1_000_000n, totalSupplyShares: 1_000_000_000_000n,
   *     totalBorrowAssets: 0n, totalBorrowShares: 0n, lastUpdate: timestamp, fee: 0n },
   * );
   * const adapter = new AccrualVaultV2MorphoMarketV1Adapter({
   *   address: adapterAddress, parentVault: zeroAddress, skimRecipient: zeroAddress,
   *   marketParamsList: [marketParams],
   * }, [position]).accrueInterest(expectedInclusionTimestamp + inclusionMargin);
   * const recordedAllocation = 480n;
   * const data = encodeAbiParameters([marketParamsAbi], [marketParams]);
   * const pending = adapter.pendingAllocationIncrease(data, [{
   *   id: VaultV2MorphoMarketV1Adapter.adapterMarketCapId(adapterAddress, marketParams),
   *   allocation: recordedAllocation,
   *   absoluteCap: 0n,
   *   relativeCap: 0n,
   * }]);
   * // pending === 20n (position worth 500n, recorded allocation 480n)
   * ```
   */
  pendingAllocationIncrease(
    data: Hex,
    allocations: readonly IVaultV2Allocation[],
  ): bigint {
    const params = MarketParams.fromHex(data);
    const id = VaultV2MorphoMarketV1Adapter.adapterMarketCapId(
      this.address,
      params,
    );
    const recorded = allocations.find((allocation) => allocation.id === id);
    if (recorded == null) return 0n;
    const position = this.positions.find(
      (entry) => entry.marketId === params.id,
    );
    return MathLib.zeroFloorSub(
      position?.supplyAssets ?? 0n,
      recorded.allocation,
    );
  }

  maxWithdraw(data: Hex) {
    const marketId = MarketParams.fromHex(data).id;
    const position = this.positions.find(
      // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
      (position) => position.marketId === marketId,
    );

    return (
      position?.market?.getWithdrawCapacityLimit(position) ?? {
        value: 0n,
        limiter: CapacityLimitReason.position,
      }
    );
  }
}
