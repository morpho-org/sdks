import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { blueAbi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import type { BlueMarket } from "../../helpers/parse.js";
import { parseBlueMarket, parseUint256 } from "../../helpers/parse.js";
import {
  type BlueWithdrawBuyCallbackAction,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import type { BlueWithdrawBuyCallbackParams } from "./withdrawBuyCallback.js";

declare const blueWithdrawBuyCallbackBrand: unique symbol;
/** Validated direct callback withdrawal inputs. @internal */
export interface BlueWithdrawBuyCallbackInput {
  readonly metadata?: Metadata;
  readonly marketParams: BlueMarket;
  readonly callbackAddress: Address;
  readonly userAddress: Address;
  readonly shares: bigint;
  readonly to: Address;
  readonly [blueWithdrawBuyCallbackBrand]: true;
}

/** Parses the direct callback withdrawal without reading chain state. @internal */
export const parseBlueWithdrawBuyCallback = (
  params: BlueWithdrawBuyCallbackParams,
) => {
  const marketParams = parseBlueMarket(params.market.marketParams);
  const { chainId } = params.market;
  const { callbackAddress, userAddress } = params.args;
  const shares = parseUint256("shares", params.args.shares);
  if (shares === 0n) {
    throw new NonPositiveInputError("shares", shares);
  }
  const result: Omit<BlueWithdrawBuyCallbackInput, symbol> = {
    metadata: params.metadata,
    marketParams,
    callbackAddress,
    userAddress,
    shares,
    to: getChainAddress(chainId, "blue"),
  };
  return result as BlueWithdrawBuyCallbackInput;
};

/** Encodes an already parsed direct callback withdrawal. @internal */
export const buildBlueWithdrawBuyCallback = (
  parsed: ReturnType<typeof parseBlueWithdrawBuyCallback>,
): Readonly<Transaction<BlueWithdrawBuyCallbackAction>> => {
  const { metadata, marketParams, callbackAddress, userAddress, shares, to } =
    parsed;
  let tx = {
    to,
    value: 0n,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "withdraw",
      args: [marketParams, 0n, shares, callbackAddress, userAddress],
    }),
  };
  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }
  return deepFreeze({
    ...tx,
    action: {
      type: "blueWithdrawBuyCallback",
      args: {
        market: marketParams.id,
        shares,
        onBehalf: callbackAddress,
        receiver: userAddress,
      },
    },
  });
};
