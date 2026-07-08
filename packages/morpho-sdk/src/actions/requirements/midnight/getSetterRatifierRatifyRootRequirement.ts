import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, encodeFunctionData, type Hex } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import type {
  SetterRatifierRatifyRootAction,
  Transaction,
} from "../../../types/index.js";

/** Parameters for {@link getSetterRatifierRatifyRootRequirement}. */
export interface GetSetterRatifierRatifyRootRequirementParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly maker: Address;
  readonly root: Hex;
}

/**
 * Resolves the SetterRatifier root approval transaction for a maker offer tree.
 *
 * Call after building a Setter-ratified tree and before encoding/submitting its
 * payload. Entity make-offer flows call this from `getRequirements()` and omit
 * the transaction when the maker has already approved the root.
 *
 * @param params.viemClient - Viem client used to read root approval state.
 * @param params.chainId - Chain id expected by the viem client.
 * @param params.maker - Maker whose root approval is checked.
 * @param params.root - Offer-tree root that must be approved.
 * @returns Ratify-root transaction, or `null` when the root is already ratified.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @example
 * ```ts
 * import { getSetterRatifierRatifyRootRequirement } from "@morpho-org/morpho-sdk";
 *
 * const tx = await getSetterRatifierRatifyRootRequirement({
 *   viemClient: client,
 *   chainId: 8453,
 *   maker: user,
 *   root,
 * });
 * if (tx) {
 *   await walletClient.sendTransaction({
 *     to: tx.to,
 *     data: tx.data,
 *     value: tx.value,
 *   });
 * }
 * ```
 */
export const getSetterRatifierRatifyRootRequirement = async (
  params: GetSetterRatifierRatifyRootRequirementParams,
): Promise<Readonly<Transaction<SetterRatifierRatifyRootAction>> | null> => {
  validateChainId(params.viemClient.chain?.id, params.chainId);

  const setterRatifier = getChainAddress(params.chainId, "setterRatifier");
  const isRootRatified = await readContract(params.viemClient, {
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "isRootRatified",
    args: [params.maker, params.root],
  });

  if (isRootRatified) return null;

  return deepFreeze({
    to: setterRatifier,
    value: 0n,
    data: encodeFunctionData({
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [params.maker, params.root, true],
    }),
    action: {
      type: "setterRatifierRatifyRoot",
      args: {
        maker: params.maker,
        root: params.root,
        isRootRatified: true,
      },
    },
  });
};
