import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  Metadata,
  MidnightRatifyRootAction,
  Transaction,
} from "../../types/index.js";

/** Parameters for {@link midnightRatifyRoot}. */
export interface MidnightRatifyRootParams {
  readonly chainId: number;
  readonly maker: Address;
  readonly root: Hex;
  readonly isRootRatified?: boolean;
  readonly metadata?: Metadata;
}

/** Encodes `SetterRatifier.setIsRootRatified(maker, root, true)`. */
export const midnightRatifyRoot = (
  params: MidnightRatifyRootParams,
): Readonly<Transaction<MidnightRatifyRootAction>> => {
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
      type: "midnightRatifyRoot",
      args: {
        maker: params.maker,
        root: params.root,
        isRootRatified,
      },
    },
  });
};
