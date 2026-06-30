import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, encodeFunctionData, type Hex } from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import type {
  MidnightRatifyRootAction,
  Transaction,
} from "../../../types/index.js";

/** Parameters for {@link getMidnightRatifyRootRequirement}. */
export interface GetMidnightRatifyRootRequirementParams {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly maker: Address;
  readonly root: Hex;
}

/**
 * Resolves the SetterRatifier root approval transaction for a maker offer tree.
 *
 * @param params - Root approval resolution parameters.
 * @returns Ratify-root transaction, or `null` when the root is already ratified.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @example
 * ```ts
 * import { getMidnightRatifyRootRequirement } from "@morpho-org/morpho-sdk";
 *
 * const tx = await getMidnightRatifyRootRequirement({
 *   viemClient: client,
 *   chainId: 8453,
 *   maker: user,
 *   root,
 * });
 * console.log(tx?.action.type);
 * ```
 */
export const getMidnightRatifyRootRequirement = async (
  params: GetMidnightRatifyRootRequirementParams,
): Promise<Readonly<Transaction<MidnightRatifyRootAction>> | null> => {
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
      type: "midnightRatifyRoot",
      args: {
        maker: params.maker,
        root: params.root,
        isRootRatified: true,
      },
    },
  });
};
