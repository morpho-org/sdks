import {
  InvalidTreeError,
  type MarketInput,
  MarketUtils,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeFunctionData,
  type Hex,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import {
  DuplicateMidnightCollateralSupplyError,
  EmptyMidnightCollateralSuppliesError,
  type Metadata,
  type MidnightSupplyCollateralMakeBorrowAction,
  NegativeInputError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import { emptyBlueMarket, validateGroupCancellations } from "./bundlesV2.js";
import type { MidnightGroupCancellation } from "./cancelOffers.js";

/** One collateral transfer pulled from `msg.sender` and supplied to its Midnight position. */
export interface MidnightBundlesV2CollateralSupply {
  /** Index into the market's `collateralParams`. */
  readonly collateralIndex: bigint;
  /** Collateral assets to supply. */
  readonly assets: bigint;
}

/** Parameters for encoding an atomic Midnight Bundles V2 collateral supply and borrow-offer publication. */
export interface MidnightSupplyCollateralMakeBorrowParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralSupplies: readonly MidnightBundlesV2CollateralSupply[];
  /** PriceRatifierV1 or RateRatifierV1 address shared by the offer tree. */
  readonly ratifier: Address;
  /** Offer-tree root ratified for `msg.sender` before publication. */
  readonly root: Hex;
  /** Group ids included in the payload. */
  readonly groups: readonly Hex[];
  /** Number of non-padding offers in the payload. */
  readonly offers: number;
  /** Encoded mempool payload logged after ratification. */
  readonly payload: Hex;
  /** Prior offer groups to cancel first; defaults to none. */
  readonly cancellations?: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

/**
 * Encodes `MidnightBundlesV2.midnightBundlesV2CancelAndMake` for a borrow maker.
 *
 * In one transaction for `msg.sender`, the bundle cancels `cancellations` (reverting if any
 * group's consumption exceeds its ceiling), pulls and supplies every collateral transfer,
 * authorizes `ratifier` on Midnight, ratifies `root` directly, and logs `payload` to the
 * Midnight mempool. No assets are parked in Blue and no token permits are accepted.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.market - Midnight market receiving collateral.
 * @param params.collateralSupplies - Collateral transfers by market collateral index.
 * @param params.ratifier - PriceRatifierV1 or RateRatifierV1 address of the offer tree.
 * @param params.root - Offer-tree root to ratify.
 * @param params.groups - Group ids included in the payload.
 * @param params.offers - Number of non-padding offers in the payload.
 * @param params.payload - Encoded mempool payload bytes.
 * @param params.cancellations - Optional prior groups to cancel with consumption ceilings.
 * @param params.deadline - Bundle execution deadline timestamp.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightSupplyCollateralMakeBorrowAction>` targeting `MidnightBundlesV2`.
 * @throws {EmptyMidnightCollateralSuppliesError} when no collateral transfer is provided.
 * @throws {NonPositiveInputError} when a collateral transfer amount is non-positive.
 * @throws {DuplicateMidnightCollateralSupplyError} when a collateral index appears twice.
 * @throws {UnknownCollateralIndexError} when a collateral index is not configured on the market.
 * @throws {InvalidTreeError} when `offers <= 0`.
 * @throws {NegativeInputError} when `deadline` or a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128`.
 * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears twice.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightSupplyCollateralMakeBorrow } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSupplyCollateralMakeBorrow({
 *   chainId: 8453,
 *   market: marketParams,
 *   collateralSupplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
 *   ratifier: priceRatifierV1,
 *   root: tree.root,
 *   groups,
 *   offers: tree.offers.length,
 *   payload,
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightSupplyCollateralMakeBorrow = (
  params: MidnightSupplyCollateralMakeBorrowParams,
): Readonly<Transaction<MidnightSupplyCollateralMakeBorrowAction>> => {
  if (params.collateralSupplies.length === 0) {
    throw new EmptyMidnightCollateralSuppliesError();
  }
  if (params.offers <= 0) {
    throw new InvalidTreeError("Tree must contain at least one offer.");
  }
  if (params.deadline < 0n) {
    throw new NegativeInputError("deadline", params.deadline);
  }
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const indices = new Set<bigint>();
  for (const [
    index,
    { collateralIndex, assets },
  ] of params.collateralSupplies.entries()) {
    if (assets <= 0n) {
      throw new NonPositiveInputError(
        `collateralSupplies[${index}].assets`,
        assets,
      );
    }
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
    if (indices.has(collateralIndex)) {
      throw new DuplicateMidnightCollateralSupplyError({
        index,
        collateralIndex,
      });
    }
    indices.add(collateralIndex);
  }
  const cancellations = validateGroupCancellations(params.cancellations ?? []);
  const collateralSupplies = params.collateralSupplies.map(
    ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
  );

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        emptyBlueMarket,
        0n,
        zeroHash,
        MarketUtils.toStruct(params.market),
        collateralSupplies,
        params.ratifier,
        params.root,
        0n,
        0n,
        0n,
        0,
        zeroHash,
        zeroHash,
        cancellations,
        params.payload,
        params.deadline,
        zeroAddress,
      ],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateralMakeBorrow",
      args: {
        market: MarketUtils.toId(params.market),
        collateralSupplies,
        ratifier: params.ratifier,
        root: params.root,
        groups: [...params.groups],
        offers: params.offers,
        cancellations,
        deadline: params.deadline,
      },
    },
  });
};
