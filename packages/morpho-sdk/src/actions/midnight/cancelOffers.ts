import { midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, type Hex, zeroAddress, zeroHash } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  EmptyMidnightGroupCancellationsError,
  type Metadata,
  type MidnightCancelOffersAction,
  NegativeInputError,
  type Transaction,
} from "../../types/index.js";
import { emptyBlueMarket, validateGroupCancellations } from "./bundlesV2.js";

/** One offer group to cancel, guarded by the maximum consumption accepted at execution. */
export interface MidnightGroupCancellation {
  /** Offer group id to mark fully consumed. */
  readonly group: Hex;
  /** Largest current group consumption accepted; the whole call reverts above it. */
  readonly maxConsumed: bigint;
}

/** Parameters for encoding a guarded Midnight Bundles V2 batch offer-group cancellation. */
export interface MidnightCancelOffersParams {
  readonly chainId: number;
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  readonly metadata?: Metadata;
}

const emptyMidnightMarket = {
  chainId: 0n,
  midnight: zeroAddress,
  loanToken: zeroAddress,
  collateralParams: [],
  maturity: 0n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;

/**
 * Encodes a `MidnightBundlesV2.midnightBundlesV2CancelAndMake` call that only cancels offer groups.
 *
 * Every group is marked fully consumed for `msg.sender`. Execution reverts as a whole if any
 * group's consumption exceeds its `maxConsumed` ceiling, so intervening fills never leave a
 * partially cancelled batch. No root is published, no assets are parked, and no collateral moves.
 *
 * @param params.chainId - Chain id used to resolve `MidnightBundlesV2`.
 * @param params.cancellations - Offer groups and their consumption ceilings.
 * @param params.deadline - Bundle execution deadline timestamp; pass `maxUint256` explicitly for no expiry.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightCancelOffersAction>` targeting `MidnightBundlesV2`.
 * @throws {EmptyMidnightGroupCancellationsError} when no groups are provided.
 * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
 * @throws {NegativeInputError} when `deadline` or a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128`.
 * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
 * @example
 * ```ts
 * import { maxUint256 } from "viem";
 * import { midnightCancelOffers } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightCancelOffers({
 *   chainId: 8453,
 *   cancellations: [{ group, maxConsumed: 0n }],
 *   deadline: maxUint256,
 * });
 * ```
 */
export const midnightCancelOffers = (
  params: MidnightCancelOffersParams,
): Readonly<Transaction<MidnightCancelOffersAction>> => {
  if (params.cancellations.length === 0) {
    throw new EmptyMidnightGroupCancellationsError();
  }
  if (params.deadline < 0n) {
    throw new NegativeInputError("deadline", params.deadline);
  }
  const cancellations = validateGroupCancellations(params.cancellations);

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
        emptyMidnightMarket,
        [],
        zeroAddress,
        zeroHash,
        0n,
        0n,
        0n,
        0,
        zeroHash,
        zeroHash,
        cancellations,
        "0x",
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
      type: "midnightCancelOffers",
      args: { cancellations, deadline: params.deadline },
    },
  });
};
