import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex, zeroAddress } from "viem";
import { midnightAbi } from "../abis.js";
import { type IMarket, Market } from "../market/index.js";
import type { BigIntish, MidnightCall } from "../types.js";

const call = (to: Address | string, data: Hex): MidnightCall =>
  deepFreeze({ to: to as Address, data });

/**
 * Parameters for `Midnight.supplyCollateral`.
 *
 * @example
 * ```ts
 * import type { SupplyCollateralCallParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SupplyCollateralCallParams;
 * console.log(params.assets);
 * ```
 */
export interface SupplyCollateralCallParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Market whose collateral is supplied. */
  readonly market: IMarket | Market;
  /** Collateral index. */
  readonly collateralIndex: BigIntish;
  /** Assets supplied. */
  readonly assets: BigIntish;
  /** Account receiving the collateral position. */
  readonly onBehalf: Address | string;
}

/**
 * Parameters for `Midnight.withdrawCollateral`.
 *
 * @example
 * ```ts
 * import type { WithdrawCollateralCallParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as WithdrawCollateralCallParams;
 * console.log(params.receiver);
 * ```
 */
export interface WithdrawCollateralCallParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Market whose collateral is withdrawn. */
  readonly market: IMarket | Market;
  /** Collateral index. */
  readonly collateralIndex: BigIntish;
  /** Assets withdrawn. */
  readonly assets: BigIntish;
  /** Account whose collateral position is debited. */
  readonly onBehalf: Address | string;
  /** Receiver of withdrawn collateral. */
  readonly receiver: Address | string;
}

/**
 * Parameters for `Midnight.repay`.
 *
 * @example
 * ```ts
 * import type { RepayCallParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as RepayCallParams;
 * console.log(params.units);
 * ```
 */
export interface RepayCallParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Market whose debt is repaid. */
  readonly market: IMarket | Market;
  /** Units repaid. */
  readonly units: BigIntish;
  /** Account whose debt is repaid. */
  readonly onBehalf: Address | string;
  /** Optional repay callback. */
  readonly callback?: Address | string;
  /** Callback payload. */
  readonly data?: Hex;
}

/**
 * Parameters for `Midnight.setIsAuthorized`.
 *
 * @example
 * ```ts
 * import type { SetIsAuthorizedCallParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SetIsAuthorizedCallParams;
 * console.log(params.newIsAuthorized);
 * ```
 */
export interface SetIsAuthorizedCallParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Authorized account or contract. */
  readonly authorized: Address | string;
  /** New authorization value. */
  readonly newIsAuthorized: boolean;
  /** Account granting authorization. */
  readonly onBehalf: Address | string;
}

/**
 * Parameters for `Midnight.setConsumed`.
 *
 * @example
 * ```ts
 * import type { SetConsumedCallParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SetConsumedCallParams;
 * console.log(params.amount);
 * ```
 */
export interface SetConsumedCallParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Consumption group id. */
  readonly group: Hex;
  /** Consumed amount to set. */
  readonly amount: BigIntish;
  /** Account whose group consumption is updated. */
  readonly onBehalf: Address | string;
}

/**
 * Namespaced calldata encoders for direct user-facing Midnight calls.
 *
 * @example
 * ```ts
 * import { MidnightCalls } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof MidnightCalls.setIsAuthorized);
 * ```
 */
export namespace MidnightCalls {
  /**
   * Encodes `Midnight.supplyCollateral`.
   *
   * @param params - Call parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightCalls } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightCalls.supplyCollateral({} as never);
   * console.log(call.data);
   * ```
   */
  export function supplyCollateral(
    params: SupplyCollateralCallParams,
  ): MidnightCall {
    return call(
      params.midnight,
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "supplyCollateral",
        args: [
          Market.from(params.market).toStruct(),
          BigInt(params.collateralIndex),
          BigInt(params.assets),
          params.onBehalf as Address,
        ],
      }),
    );
  }

  /**
   * Encodes `Midnight.withdrawCollateral`.
   *
   * @param params - Call parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightCalls } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightCalls.withdrawCollateral({} as never);
   * console.log(call.to);
   * ```
   */
  export function withdrawCollateral(
    params: WithdrawCollateralCallParams,
  ): MidnightCall {
    return call(
      params.midnight,
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "withdrawCollateral",
        args: [
          Market.from(params.market).toStruct(),
          BigInt(params.collateralIndex),
          BigInt(params.assets),
          params.onBehalf as Address,
          params.receiver as Address,
        ],
      }),
    );
  }

  /**
   * Encodes `Midnight.repay`.
   *
   * @param params - Call parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightCalls } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightCalls.repay({} as never);
   * console.log(call.data);
   * ```
   */
  export function repay(params: RepayCallParams): MidnightCall {
    return call(
      params.midnight,
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "repay",
        args: [
          Market.from(params.market).toStruct(),
          BigInt(params.units),
          params.onBehalf as Address,
          (params.callback ?? zeroAddress) as Address,
          (params.data ?? "0x") as Hex,
        ],
      }),
    );
  }

  /**
   * Encodes `Midnight.setIsAuthorized`.
   *
   * @param params - Call parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightCalls } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightCalls.setIsAuthorized({} as never);
   * console.log(call.to);
   * ```
   */
  export function setIsAuthorized(
    params: SetIsAuthorizedCallParams,
  ): MidnightCall {
    return call(
      params.midnight,
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [
          params.authorized as Address,
          params.newIsAuthorized,
          params.onBehalf as Address,
        ],
      }),
    );
  }

  /**
   * Encodes `Midnight.setConsumed`.
   *
   * @param params - Call parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightCalls } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightCalls.setConsumed({} as never);
   * console.log(call.data);
   * ```
   */
  export function setConsumed(params: SetConsumedCallParams): MidnightCall {
    return call(
      params.midnight,
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "setConsumed",
        args: [
          params.group as Hex,
          BigInt(params.amount),
          params.onBehalf as Address,
        ],
      }),
    );
  }
}
