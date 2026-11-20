import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddressEqual,
  maxUint128,
  zeroAddress,
} from "viem";
import { encodeMidnightCalldata } from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightBytes32 } from "../../helpers/validateMidnightPublication.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  type Metadata,
  type MidnightCancelOffersAction,
  MidnightZeroOnBehalfError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for a direct Midnight cancellation of one or more offer groups. */
export interface MidnightCancelOffersParams {
  readonly chainId: number;
  readonly groups: readonly Hex[];
  readonly onBehalf: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes a full cancellation of one or more offer groups as a direct call to Midnight.
 *
 * One group encodes a bare `setConsumed(group, maxUint128, onBehalf)`. Two or more groups encode
 * one Midnight `multicall` holding one such `setConsumed` call per group, in list order; the batch
 * cancels every group or none. Only the single-group encoding is matchable by a wallet policy that
 * allows `setConsumed` by method name: a batch is a `multicall` call, so cancel one group per
 * transaction when the signer's policy names `setConsumed`.
 *
 * The amount is always `maxUint128`, which Midnight never rejects, so cancelling a group again
 * succeeds. Cancellation is per group: it does not unratify roots or revoke authorizations. The
 * transaction never targets `MidnightBundlesV2` and needs no prior authorization or approval.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.groups - Nonempty list of distinct 32-byte offer groups to cancel.
 * @param params.onBehalf - Maker whose groups are cancelled. `onBehalf`, or an operator it
 *   authorized on Midnight, must send the transaction; otherwise Midnight reverts
 *   `Unauthorized()` and no group changes.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightCancelOffersAction>` targeting `Midnight`.
 * @throws {MidnightCalldataEncodingError} when `onBehalf` is not a valid address.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {EmptyMidnightGroupCancellationsError} when `groups` is empty.
 * @throws {InvalidMidnightHexInputError} when a group is not 32-byte hex.
 * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnight` deployment.
 * @example
 * ```ts
 * import { midnightCancelOffers } from "@morpho-org/morpho-sdk";
 * import type { Address, Hex } from "viem";
 *
 * declare const maker: Address;
 * declare const group: Hex;
 *
 * // One group: calldata is `setConsumed(group, maxUint128, maker)`.
 * const tx = midnightCancelOffers({
 *   chainId: 8453,
 *   groups: [group],
 *   onBehalf: maker,
 * });
 * // tx.action => { type: "midnightCancelOffers", args: { groups: [group], onBehalf: maker } }
 * ```
 */
export const midnightCancelOffers = (
  params: MidnightCancelOffersParams,
): Readonly<Transaction<MidnightCancelOffersAction>> => {
  const { chainId, onBehalf, metadata } = params;
  // Copy the list so validation and encoding read one snapshot and the caller's array stays unfrozen.
  const groups = [...params.groups];

  // Reject a malformed account before comparing it with the zero address.
  validateMidnightAddress("onBehalf", onBehalf);
  if (isAddressEqual(onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  if (groups.length === 0) {
    throw new EmptyMidnightGroupCancellationsError();
  }
  const seen = new Set<string>();
  for (const [index, group] of groups.entries()) {
    // Validation only; rejects groups that are not 32-byte hex.
    validateMidnightBytes32(`groups[${index}]`, group);
    const key = group.toLowerCase();
    if (seen.has(key)) {
      throw new DuplicateMidnightGroupCancellationError({ index, group });
    }
    seen.add(key);
  }
  const midnight = getChainAddress(chainId, "midnight");

  const calls = groups.map((group) =>
    encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [group, maxUint128, onBehalf],
    }),
  );
  const [single] = calls;
  let tx = {
    to: midnight,
    value: 0n,
    // A single cancellation stays a bare `setConsumed` so a method-name policy can match it.
    data:
      calls.length === 1 && single !== undefined
        ? single
        : encodeMidnightCalldata({
            abi: midnightAbi,
            functionName: "multicall",
            args: [calls],
          }),
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightCancelOffers",
      args: { groups, onBehalf },
    },
  });
};
