import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  SetterRatifierRatifyRootAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link setterRatifierRatifyRoot}. */
export interface SetterRatifierRatifyRootParams {
  /** Chain id used to resolve the SetterRatifier deployment. */
  readonly chainId: number;
  /** Maker whose offer-tree root is being ratified. */
  readonly maker: Address;
  /** Offer-tree root to ratify or unratify. */
  readonly root: Hex;
  /** Whether the root should be ratified. Defaults to `true`. */
  readonly isRootRatified?: boolean;
  /** Optional metadata appended to the transaction calldata. */
  readonly metadata?: Metadata;
}

/**
 * Encodes a SetterRatifier root-ratification transaction.
 *
 * Use this after building a Setter-ratified offer tree and before submitting
 * its mempool payload. Entity make-offer flows expose the same transaction
 * through `TransactionPlan.prepare()` when the root is not already approved.
 *
 * @param params.chainId - Chain id used to resolve `SetterRatifier`.
 * @param params.maker - Maker whose root approval is updated.
 * @param params.root - Offer-tree root to approve or revoke.
 * @param params.isRootRatified - Optional target state; defaults to `true`.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<SetterRatifierRatifyRootAction>` targeting `SetterRatifier`.
 * @example
 * ```ts
 * import { setterRatifierRatifyRoot } from "@morpho-org/morpho-sdk";
 *
 * const tx = setterRatifierRatifyRoot({
 *   chainId: 8453,
 *   maker,
 *   root,
 * });
 * ```
 */
export const setterRatifierRatifyRoot = (
  params: SetterRatifierRatifyRootParams,
): Readonly<Transaction<SetterRatifierRatifyRootAction>> => {
  const isRootRatified = params.isRootRatified ?? true;
  const setterRatifier = getChainAddress(params.chainId, "setterRatifier");

  let tx = {
    to: setterRatifier,
    value: 0n,
    data: encodeFunctionData({
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [params.maker, params.root, isRootRatified],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "setterRatifierRatifyRoot",
      args: {
        maker: params.maker,
        root: params.root,
        isRootRatified,
      },
    },
  });
};
