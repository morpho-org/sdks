import { midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { encodeFunctionData, maxUint128, zeroAddress, zeroHash } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  type Metadata,
  type MidnightCancelOffersAction,
  type MidnightGroupCancellation,
  NegativeInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for encoding a guarded Midnight Bundles V2 batch offer-group cancellation. */
export interface MidnightCancelOffersParams {
  /** Chain id used to resolve `MidnightBundlesV2`. */
  readonly chainId: number;
  /** Offer groups and their consumption ceilings, each group at most once. */
  readonly cancellations: readonly MidnightGroupCancellation[];
  /** Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry. */
  readonly deadline: bigint;
  /** Optional analytics metadata appended to calldata. */
  readonly metadata?: Metadata;
}

const emptyBlueMarket = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;

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

const validateParams = ({
  cancellations,
  deadline,
}: MidnightCancelOffersParams): void => {
  if (cancellations.length === 0) {
    throw new EmptyMidnightGroupCancellationsError();
  }
  if (deadline < 0n) {
    throw new NegativeInputError("deadline", deadline);
  }
  const groups = new Set<string>();
  for (const [index, { group, maxConsumed }] of cancellations.entries()) {
    const field = `cancellations[${index}].maxConsumed`;
    if (maxConsumed < 0n) throw new NegativeInputError(field, maxConsumed);
    if (maxConsumed > maxUint128) {
      throw new InputExceedsMaxError({
        field,
        value: maxConsumed,
        max: maxUint128,
      });
    }
    const key = group.toLowerCase();
    if (groups.has(key)) {
      throw new DuplicateMidnightGroupCancellationError({ index, group });
    }
    groups.add(key);
  }
};

/**
 * Encodes a `MidnightBundlesV2.midnightBundlesV2CancelAndMake` call that only cancels offer groups.
 *
 * Every group is marked fully consumed for `msg.sender`, so send the transaction from the maker. Execution reverts as a whole if any
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
 * import { maxUint256, type Hex } from "viem";
 * import { midnightCancelOffers } from "@morpho-org/morpho-sdk";
 *
 * declare const group: Hex;
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
  validateParams(params);

  const cancellations = params.cancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data: encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        emptyBlueMarket, // blueMarket
        0n, // assetsToPark
        zeroHash, // callbackSalt
        emptyMidnightMarket, // market
        [], // collateralSupplies
        zeroAddress, // ratifier
        zeroHash, // newRoot
        0n, // signatureHeight
        0n, // signatureNonce
        0n, // signatureDeadline
        0, // v
        zeroHash, // r
        zeroHash, // s
        cancellations, // groupsToCancel
        "0x", // payload
        params.deadline, // deadline
        zeroAddress, // wrappedNative
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
