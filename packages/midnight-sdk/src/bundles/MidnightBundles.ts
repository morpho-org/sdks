import { type Address, encodeFunctionData, type Hex, zeroAddress } from "viem";

import { midnightBundlesAbi } from "../abis.js";
import { NoMatchingOffersError } from "../errors.js";
import { deepFreeze } from "../internal.js";
import { type IMarket, type Market, normalizeMarket } from "../market/index.js";
import { type ITake, normalizeTake, type TakeStruct } from "../offers/index.js";
import {
  type BigIntish,
  type CollateralSupply,
  type CollateralWithdrawal,
  type MidnightCall,
  PermitKind,
  type TokenPermit,
} from "../types.js";

/**
 * Collateral withdrawal input accepted by bundle encoders.
 *
 * @example
 * ```ts
 * import type { CollateralWithdrawalInput } from "@morpho-org/midnight-sdk";
 *
 * const input: CollateralWithdrawalInput = { collateralIndex: 0n, assets: 100n };
 * ```
 */
export interface CollateralWithdrawalInput {
  /** Collateral index. */
  readonly collateralIndex: BigIntish;
  /** Asset amount. */
  readonly assets: BigIntish;
}

/**
 * Collateral supply input accepted by bundle encoders.
 *
 * @example
 * ```ts
 * import { PermitKind, type CollateralSupplyInput } from "@morpho-org/midnight-sdk";
 *
 * const input: CollateralSupplyInput = {
 *   collateralIndex: 0n,
 *   assets: 100n,
 *   permit: { kind: PermitKind.None, data: "0x" },
 * };
 * ```
 */
export interface CollateralSupplyInput {
  /** Collateral index. */
  readonly collateralIndex: BigIntish;
  /** Asset amount. */
  readonly assets: BigIntish;
  /** Optional token permit. */
  readonly permit?: TokenPermit;
}

/**
 * Input accepted anywhere a bundle encoder expects `Take[]`.
 *
 * @example
 * ```ts
 * import type { BundleTakeInput } from "@morpho-org/midnight-sdk";
 *
 * const input = {} as BundleTakeInput;
 * console.log(input);
 * ```
 */
export type BundleTakeInput = ITake | TakeStruct;

/**
 * Parameters for `buyWithUnitsTargetAndWithdrawCollateral`.
 *
 * @example
 * ```ts
 * import type { BuyWithUnitsTargetAndWithdrawCollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as BuyWithUnitsTargetAndWithdrawCollateralParams;
 * console.log(params.targetUnits);
 * ```
 */
export interface BuyWithUnitsTargetAndWithdrawCollateralParams {
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Target units to buy. */
  readonly targetUnits: BigIntish;
  /** Maximum buyer assets paid by the caller. */
  readonly maxBuyerAssets: BigIntish;
  /** Taker account. */
  readonly taker: Address | string;
  /** Optional loan token permit. */
  readonly loanTokenPermit?: TokenPermit;
  /** Ordered executable takes. */
  readonly takes: readonly BundleTakeInput[];
  /** Optional collateral withdrawals. */
  readonly collateralWithdrawals?: readonly CollateralWithdrawalInput[];
  /** Collateral receiver. */
  readonly collateralReceiver: Address | string;
  /** Referral fee percentage. */
  readonly referralFeePct?: BigIntish;
  /** Referral fee recipient. */
  readonly referralFeeRecipient?: Address | string;
}

/**
 * Parameters for `supplyCollateralAndSellWithUnitsTarget`.
 *
 * @example
 * ```ts
 * import type { SupplyCollateralAndSellWithUnitsTargetParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SupplyCollateralAndSellWithUnitsTargetParams;
 * console.log(params.targetUnits);
 * ```
 */
export interface SupplyCollateralAndSellWithUnitsTargetParams {
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Target units to sell. */
  readonly targetUnits: BigIntish;
  /** Minimum seller assets received. */
  readonly minSellerAssets: BigIntish;
  /** Taker account. */
  readonly taker: Address | string;
  /** Receiver if taker is seller. */
  readonly receiverIfTakerIsSeller: Address | string;
  /** Optional collateral supplies. */
  readonly collateralSupplies?: readonly CollateralSupplyInput[];
  /** Ordered executable takes. */
  readonly takes: readonly BundleTakeInput[];
  /** Referral fee percentage. */
  readonly referralFeePct?: BigIntish;
  /** Referral fee recipient. */
  readonly referralFeeRecipient?: Address | string;
}

/**
 * Parameters for `buyWithAssetsTargetAndWithdrawCollateral`.
 *
 * @example
 * ```ts
 * import type { BuyWithAssetsTargetAndWithdrawCollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as BuyWithAssetsTargetAndWithdrawCollateralParams;
 * console.log(params.targetBuyerAssets);
 * ```
 */
export interface BuyWithAssetsTargetAndWithdrawCollateralParams {
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Target buyer assets. */
  readonly targetBuyerAssets: BigIntish;
  /** Minimum units gained. */
  readonly minUnits: BigIntish;
  /** Taker account. */
  readonly taker: Address | string;
  /** Optional loan token permit. */
  readonly loanTokenPermit?: TokenPermit;
  /** Ordered executable takes. */
  readonly takes: readonly BundleTakeInput[];
  /** Optional collateral withdrawals. */
  readonly collateralWithdrawals?: readonly CollateralWithdrawalInput[];
  /** Collateral receiver. */
  readonly collateralReceiver: Address | string;
  /** Referral fee percentage. */
  readonly referralFeePct?: BigIntish;
  /** Referral fee recipient. */
  readonly referralFeeRecipient?: Address | string;
}

/**
 * Parameters for `supplyCollateralAndSellWithAssetsTarget`.
 *
 * @example
 * ```ts
 * import type { SupplyCollateralAndSellWithAssetsTargetParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SupplyCollateralAndSellWithAssetsTargetParams;
 * console.log(params.targetSellerAssets);
 * ```
 */
export interface SupplyCollateralAndSellWithAssetsTargetParams {
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Target seller assets. */
  readonly targetSellerAssets: BigIntish;
  /** Maximum units sold. */
  readonly maxUnits: BigIntish;
  /** Taker account. */
  readonly taker: Address | string;
  /** Receiver if taker is seller. */
  readonly receiverIfTakerIsSeller: Address | string;
  /** Optional collateral supplies. */
  readonly collateralSupplies?: readonly CollateralSupplyInput[];
  /** Ordered executable takes. */
  readonly takes: readonly BundleTakeInput[];
  /** Referral fee percentage. */
  readonly referralFeePct?: BigIntish;
  /** Referral fee recipient. */
  readonly referralFeeRecipient?: Address | string;
}

/**
 * Parameters for `repayAndWithdrawCollateral`.
 *
 * @example
 * ```ts
 * import type { RepayAndWithdrawCollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as RepayAndWithdrawCollateralParams;
 * console.log(params.assets);
 * ```
 */
export interface RepayAndWithdrawCollateralParams {
  /** MidnightBundles contract address. */
  readonly midnightBundles: Address | string;
  /** Market to repay. */
  readonly market: IMarket | Market;
  /** Loan assets to repay. */
  readonly assets: BigIntish;
  /** Account whose debt is repaid. */
  readonly onBehalf: Address | string;
  /** Optional loan token permit. */
  readonly loanTokenPermit?: TokenPermit;
  /** Optional collateral withdrawals. */
  readonly collateralWithdrawals?: readonly CollateralWithdrawalInput[];
  /** Collateral receiver. */
  readonly collateralReceiver: Address | string;
  /** Referral fee percentage. */
  readonly referralFeePct?: BigIntish;
  /** Referral fee recipient. */
  readonly referralFeeRecipient?: Address | string;
}

const emptyPermit = (): TokenPermit => ({ kind: PermitKind.None, data: "0x" });

const toPermit = (permit?: TokenPermit): TokenPermit =>
  permit == null
    ? emptyPermit()
    : { kind: permit.kind, data: permit.data as Hex };

const toWithdrawals = (
  withdrawals: readonly CollateralWithdrawalInput[] = [],
): readonly CollateralWithdrawal[] =>
  deepFreeze(
    withdrawals.map((withdrawal) => ({
      collateralIndex: BigInt(withdrawal.collateralIndex),
      assets: BigInt(withdrawal.assets),
    })),
  );

const toSupplies = (
  supplies: readonly CollateralSupplyInput[] = [],
): readonly CollateralSupply[] =>
  deepFreeze(
    supplies.map((supply) => ({
      collateralIndex: BigInt(supply.collateralIndex),
      assets: BigInt(supply.assets),
      permit: toPermit(supply.permit),
    })),
  );

const toTakes = (takes: readonly BundleTakeInput[]) => {
  if (takes.length === 0) throw new NoMatchingOffersError();

  return deepFreeze(takes.map((take) => normalizeTake(take).toStruct()));
};

const referralRecipientOrZero = (recipient?: Address | string) =>
  recipient == null ? zeroAddress : (recipient as Address);

const call = (to: Address | string, data: Hex): MidnightCall =>
  deepFreeze({ to: to as Address, data });

/**
 * Namespaced calldata encoders for MidnightBundles periphery entrypoints.
 *
 * @example
 * ```ts
 * import { MidnightBundles } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof MidnightBundles.repayAndWithdrawCollateral);
 * ```
 */
export namespace MidnightBundles {
  /**
   * Encodes `buyWithUnitsTargetAndWithdrawCollateral`.
   *
   * @param params - Bundle parameters.
   * @returns Neutral call descriptor.
   * @throws NoMatchingOffersError when `takes` is empty.
   * @example
   * ```ts
   * import { MidnightBundles } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightBundles.buyWithUnitsTargetAndWithdrawCollateral({} as never);
   * console.log(call.to);
   * ```
   */
  export function buyWithUnitsTargetAndWithdrawCollateral(
    params: BuyWithUnitsTargetAndWithdrawCollateralParams,
  ): MidnightCall {
    return call(
      params.midnightBundles,
      encodeFunctionData({
        abi: midnightBundlesAbi,
        functionName: "buyWithUnitsTargetAndWithdrawCollateral",
        args: [
          BigInt(params.targetUnits),
          BigInt(params.maxBuyerAssets),
          params.taker as Address,
          toPermit(params.loanTokenPermit),
          toTakes(params.takes),
          toWithdrawals(params.collateralWithdrawals),
          params.collateralReceiver as Address,
          BigInt(params.referralFeePct ?? 0n),
          referralRecipientOrZero(params.referralFeeRecipient),
        ],
      }),
    );
  }

  /**
   * Encodes `supplyCollateralAndSellWithUnitsTarget`.
   *
   * @param params - Bundle parameters.
   * @returns Neutral call descriptor.
   * @throws NoMatchingOffersError when `takes` is empty.
   * @example
   * ```ts
   * import { MidnightBundles } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightBundles.supplyCollateralAndSellWithUnitsTarget({} as never);
   * console.log(call.data);
   * ```
   */
  export function supplyCollateralAndSellWithUnitsTarget(
    params: SupplyCollateralAndSellWithUnitsTargetParams,
  ): MidnightCall {
    return call(
      params.midnightBundles,
      encodeFunctionData({
        abi: midnightBundlesAbi,
        functionName: "supplyCollateralAndSellWithUnitsTarget",
        args: [
          BigInt(params.targetUnits),
          BigInt(params.minSellerAssets),
          params.taker as Address,
          params.receiverIfTakerIsSeller as Address,
          toSupplies(params.collateralSupplies),
          toTakes(params.takes),
          BigInt(params.referralFeePct ?? 0n),
          referralRecipientOrZero(params.referralFeeRecipient),
        ],
      }),
    );
  }

  /**
   * Encodes `buyWithAssetsTargetAndWithdrawCollateral`.
   *
   * @param params - Bundle parameters.
   * @returns Neutral call descriptor.
   * @throws NoMatchingOffersError when `takes` is empty.
   * @example
   * ```ts
   * import { MidnightBundles } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral({} as never);
   * console.log(call.to);
   * ```
   */
  export function buyWithAssetsTargetAndWithdrawCollateral(
    params: BuyWithAssetsTargetAndWithdrawCollateralParams,
  ): MidnightCall {
    return call(
      params.midnightBundles,
      encodeFunctionData({
        abi: midnightBundlesAbi,
        functionName: "buyWithAssetsTargetAndWithdrawCollateral",
        args: [
          BigInt(params.targetBuyerAssets),
          BigInt(params.minUnits),
          params.taker as Address,
          toPermit(params.loanTokenPermit),
          toTakes(params.takes),
          toWithdrawals(params.collateralWithdrawals),
          params.collateralReceiver as Address,
          BigInt(params.referralFeePct ?? 0n),
          referralRecipientOrZero(params.referralFeeRecipient),
        ],
      }),
    );
  }

  /**
   * Encodes `supplyCollateralAndSellWithAssetsTarget`.
   *
   * @param params - Bundle parameters.
   * @returns Neutral call descriptor.
   * @throws NoMatchingOffersError when `takes` is empty.
   * @example
   * ```ts
   * import { MidnightBundles } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightBundles.supplyCollateralAndSellWithAssetsTarget({} as never);
   * console.log(call.data);
   * ```
   */
  export function supplyCollateralAndSellWithAssetsTarget(
    params: SupplyCollateralAndSellWithAssetsTargetParams,
  ): MidnightCall {
    return call(
      params.midnightBundles,
      encodeFunctionData({
        abi: midnightBundlesAbi,
        functionName: "supplyCollateralAndSellWithAssetsTarget",
        args: [
          BigInt(params.targetSellerAssets),
          BigInt(params.maxUnits),
          params.taker as Address,
          params.receiverIfTakerIsSeller as Address,
          toSupplies(params.collateralSupplies),
          toTakes(params.takes),
          BigInt(params.referralFeePct ?? 0n),
          referralRecipientOrZero(params.referralFeeRecipient),
        ],
      }),
    );
  }

  /**
   * Encodes `repayAndWithdrawCollateral`.
   *
   * @param params - Bundle parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { MidnightBundles } from "@morpho-org/midnight-sdk";
   *
   * const call = MidnightBundles.repayAndWithdrawCollateral({} as never);
   * console.log(call.to);
   * ```
   */
  export function repayAndWithdrawCollateral(
    params: RepayAndWithdrawCollateralParams,
  ): MidnightCall {
    return call(
      params.midnightBundles,
      encodeFunctionData({
        abi: midnightBundlesAbi,
        functionName: "repayAndWithdrawCollateral",
        args: [
          normalizeMarket(params.market).toStruct(),
          BigInt(params.assets),
          params.onBehalf as Address,
          toPermit(params.loanTokenPermit),
          toWithdrawals(params.collateralWithdrawals),
          params.collateralReceiver as Address,
          BigInt(params.referralFeePct ?? 0n),
          referralRecipientOrZero(params.referralFeeRecipient),
        ],
      }),
    );
  }
}
